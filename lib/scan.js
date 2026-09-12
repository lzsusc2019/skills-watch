// Pure detection core — no Cordis context, no globals.
//
// Everything the plugin does is decided here: which roots to scan, how to read
// a SKILL.md, how to compare a managed skill against its upstream repo, and how
// to compress a description. Callers inject `fs` and `shell`, which is what
// makes this testable without a runtime.

import { join, dirname } from 'node:path';

/** Environment key naming the Harness home, matching @deepseek-ai/dsh-home-paths. */
const DSH_HOME_ENV = 'DSH_HOME';
/** Environment key naming the agents home, matching @deepseek-ai/dsh-skill-filesystem. */
const DSH_AGENTS_HOME_ENV = 'DSH_AGENTS_HOME';
/** Environment key naming a bundled skill directory. */
const DSH_BUNDLED_SKILL_DIR_ENV = 'DSH_BUNDLED_SKILL_DIR';

/** Expand a leading `~` against the given home directory. */
export function expandHome(p, home) {
  if (typeof p !== 'string' || p.length === 0) return p;
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return p;
}

async function pathExists(fs, p) {
  try {
    const target = await fs.resolve(p);
    return (await fs.stat(target)) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Walk up from `cwd` looking for a `.git` directory, exactly as
 * @deepseek-ai/dsh-skill-filesystem does. Falling off the filesystem root
 * returns the original `cwd`.
 *
 * @param {object} fs - the filesystem provider.
 * @param {string} cwd - starting directory.
 * @returns {Promise<string>} the project root.
 */
export async function findProjectRoot(fs, cwd) {
  let current = cwd;
  for (;;) {
    if (await pathExists(fs, join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

/**
 * Resolve the skill roots to scan.
 *
 * The defaults mirror @deepseek-ai/dsh-skill-filesystem's own `roots()` so that
 * this plugin looks where the Harness actually loads skills from, instead of at
 * a layout that only happens to exist on one machine:
 *
 *   <projectRoot>/.dsh/skills       project-dsh
 *   <projectRoot>/.agents/skills    project-agents
 *   <DSH_HOME>/skills               user-dsh
 *   <DSH_AGENTS_HOME>/skills        user-agents
 *   $DSH_BUNDLED_SKILL_DIR          bundled
 *
 * `<projectRoot>` is discovered from `cwd` the same way the provider does it.
 *
 * Two things it deliberately does NOT include: `customSkillDirs` (declared per
 * agent preset, which a profile-level plugin cannot see) and `~/.claude/skills`
 * (Claude Code's directory — the Harness does not load from it). Both can be
 * added through `extraRoots`.
 *
 * @param {object} deps
 * @param {object} deps.fs - filesystem provider.
 * @param {Record<string, string|undefined>} [deps.env] - environment to read.
 * @param {string} [deps.cwd] - directory used for project-root discovery.
 * @param {object} [deps.config] - explicit `roots` / `extraRoots` / `home` / …
 * @returns {Promise<{roots: string[], source: string}>}
 */
export async function resolveRoots(deps) {
  const fs = deps.fs;
  const env = deps.env ?? {};
  const config = deps.config ?? {};

  const home = config.home ?? env.HOME ?? '/';
  const expand = (p) => expandHome(p, home);

  // An explicit list is taken verbatim; nothing is inferred.
  if (Array.isArray(config.roots) && config.roots.length > 0) {
    const extra = (config.extraRoots ?? []).map(expand);
    return {
      roots: dedupe([...config.roots.map(expand), ...extra]),
      source: 'config',
      home,
      projectRoot: config.project ?? null,
    };
  }

  const dshHome = expand(
    config.dshHome
    ?? (typeof env[DSH_HOME_ENV] === 'string' && env[DSH_HOME_ENV].trim().length > 0
      ? env[DSH_HOME_ENV]
      : join(home, '.dsh')),
  );
  const agentsHome = expand(config.agentsHome ?? env[DSH_AGENTS_HOME_ENV] ?? join(home, '.agents'));
  const bundled = config.bundledSkillDir ?? env[DSH_BUNDLED_SKILL_DIR_ENV];

  const roots = [];
  let projectRoot = null;

  const cwd = config.project ?? deps.cwd;
  if (cwd) {
    projectRoot = await findProjectRoot(fs, cwd);
    roots.push(join(projectRoot, '.dsh/skills'));
    roots.push(join(projectRoot, '.agents/skills'));
  }

  roots.push(join(dshHome, 'skills'));
  roots.push(join(agentsHome, 'skills'));
  if (typeof bundled === 'string' && bundled.length > 0) roots.push(expand(bundled));

  for (const d of config.customSkillDirs ?? []) roots.push(expand(d));
  for (const d of config.extraRoots ?? []) roots.push(expand(d));

  return { roots: dedupe(roots), source: 'default', home, projectRoot };
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (typeof p !== 'string' || p.length === 0) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Trigger-phrase markers. A SKILL.md description is normally a purpose sentence
 * followed by a long list of phrases that should invoke the skill; the panel
 * shows only the purpose, so everything from the first marker onward is dropped.
 */
const CUT_MARKERS = [
  'Use this skill when', 'Use this skill for', 'Use when the user',
  'Use instead of', 'Also use when', 'Triggers on', 'Trigger on',
  'Use when', 'Use for', 'Use it when', 'Use if the user',
  '当用户说', '当用户提到', '当用户询问', '当用户要求', '当用户上传',
  '触发场景', '触发条件', '适用场景', '使用场景',
  '注意：', 'NOTE:',
];

/** YAML block-scalar indicators. */
const BLOCK_MARKERS = ['|', '>', '|-', '>-', '|+', '>+'];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY = 100;
const STALE_NEVER = null;

function collapse(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

function unquote(v) {
  if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v.length > 1 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

function isCJK(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x3000 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef);
}

/**
 * Reduce a description to its purpose sentence.
 * @param {string|null} desc - raw frontmatter description.
 * @param {number} max - character cap.
 * @returns {string|null} the compressed one-liner.
 */
export function summarize(desc, max = MAX_SUMMARY) {
  if (!desc) return null;
  let s = collapse(desc);
  if (s.length === 0) return null;

  let cut = s.length;
  for (const m of CUT_MARKERS) {
    const idx = s.indexOf(m);
    if (idx > 8 && idx < cut) cut = idx;
  }
  s = s.slice(0, cut).trim();
  if (s.length === 0) s = collapse(desc);

  const cjk = s.match(/^[\s\S]*?[。！？；]/);
  if (cjk && cjk[0].length >= 12) s = cjk[0];
  else {
    const latin = s.match(/^[\s\S]*?[.!?;](?=\s|$)/);
    if (latin && latin[0].length >= 12) s = latin[0];
  }
  s = s.trim();

  if (s.length > max) {
    let head = s.slice(0, max);
    const last = head.charAt(head.length - 1);
    if (!isCJK(last)) {
      const sp = head.lastIndexOf(' ');
      if (sp > max - 20) head = head.slice(0, sp);
    }
    s = head.replace(/[,;:\s]+$/, '') + '\u2026';
  }
  return s.replace(/[.。]\u2026$/, '\u2026');
}

/**
 * Parse the two frontmatter shapes that actually appear in SKILL.md files:
 * a block scalar (`description: |` plus indented body) and one level of nesting
 * (`metadata:` then indented keys). This is deliberately not a YAML parser.
 * @param {string} text - the SKILL.md contents.
 * @returns {Record<string, unknown>} parsed keys.
 */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const lines = m[1].split(/\r?\n/);
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) { i += 1; continue; }
    const key = kv[1];
    const val = kv[2].trim();

    if (BLOCK_MARKERS.includes(val)) {
      const buf = [];
      i += 1;
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '') { buf.push(''); i += 1; continue; }
        if (/^[ \t]/.test(l)) { buf.push(l.replace(/^[ \t]{2}/, '')); i += 1; continue; }
        break;
      }
      out[key] = collapse(buf.join(' '));
      continue;
    }

    if (val === '') {
      const sub = {};
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (l.trim() === '') { j += 1; continue; }
        const sm = l.match(/^[ \t]+([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!sm) break;
        sub[sm[1]] = unquote(sm[2].trim());
        j += 1;
      }
      if (Object.keys(sub).length > 0) { out[key] = sub; i = j; continue; }
      out[key] = '';
      i += 1;
      continue;
    }

    out[key] = unquote(val);
    i += 1;
  }
  return out;
}

function pickVersion(fm) {
  if (fm && typeof fm.version === 'string' && fm.version.length > 0) return fm.version;
  if (fm && fm.metadata && typeof fm.metadata.version === 'string' && fm.metadata.version.length > 0) return fm.metadata.version;
  return null;
}

function str(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  return null;
}

function displayPath(p, home) {
  if (p.startsWith(home + '/')) return '~/' + p.slice(home.length + 1);
  return p;
}

function shortPath(p, home, project) {
  if (p.startsWith(project + '/')) return 'personal/' + p.slice(project.length + 1);
  if (p.startsWith(home + '/')) return '~/' + p.slice(home.length + 1);
  return p.split('/').filter(Boolean).slice(-2).join('/');
}

function normalizeRepo(repo) {
  if (typeof repo !== 'string' || repo.length === 0) return null;
  if (/^https?:\/\//.test(repo) || /^git@/.test(repo) || /^ssh:\/\//.test(repo)) return repo;
  return 'https://github.com/' + repo.replace(/^\/+/, '') + '.git';
}

/**
 * Build a scanner bound to one filesystem, one shell, and one configuration.
 *
 * @param {object} deps
 * @param {{resolve: Function, listDir: Function, readText: Function}} deps.fs
 * @param {{resolve: Function, run: Function}} deps.shell
 * @param {object} [deps.config]
 * @returns {{ poll: () => Promise<object> }}
 */
export function createScanner(deps) {
  const fs = deps.fs;
  const shell = deps.shell;
  const cfg = deps.config ?? {};

  // `process` exists in the Host (Node) context; the guards keep this module
  // importable anywhere else.
  const env = deps.env ?? ((typeof process !== 'undefined' && process.env) ? process.env : {});
  const cwd = deps.cwd ?? ((typeof process !== 'undefined' && process.cwd) ? process.cwd() : undefined);

  const cacheTtlMs = cfg.cacheTtlMs ?? CACHE_TTL_MS;
  const maxSummary = cfg.maxSummary ?? MAX_SUMMARY;

  // Root discovery is async (it probes upward for `.git`) and depends on the
  // session's cwd, so results are cached per effective cwd: successive polls from
  // the same workspace reuse one resolution, and switching workspace re-resolves.
  const layoutCache = new Map();
  async function layout(cwdOverride) {
    const explicitRoots = Array.isArray(cfg.roots) && cfg.roots.length > 0;
    const effective = cfg.project ?? cwdOverride ?? cwd;
    const key = explicitRoots ? '\u0000explicit' : String(effective ?? '');
    let hit = layoutCache.get(key);
    if (hit === undefined) {
      hit = await resolveRoots({ fs, env, cwd: effective, config: cfg });
      layoutCache.set(key, hit);
    }
    return hit;
  }

  const remoteCache = new Map();

  async function readTextOrNull(p) {
    try {
      const target = await fs.resolve(p);
      const text = await fs.readText(target);
      return typeof text === 'string' ? text : null;
    } catch {
      return null;
    }
  }

  async function readJsonOrNull(p) {
    const text = await readTextOrNull(p);
    if (text === null) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  // ShellExecRequest is { command, workdir?, timeoutMs?, env? } — not argv/cwd.
  // ShellRunResult.stdout is { text, truncated, spillPath? }.
  async function runCommand(command, timeoutMs) {
    const spec = shell.resolve({
      command,
      workdir: '/tmp',
      timeoutMs: timeoutMs ?? 12000,
      // Without this, a missing or private repo makes git try to prompt for
      // credentials and block until the timeout.
      env: { GIT_TERMINAL_PROMPT: '0' },
    });
    const res = await shell.run(spec);
    return {
      exitCode: res.exitCode,
      stdout: res.stdout && typeof res.stdout.text === 'string' ? res.stdout.text : '',
      stderr: res.stderr && typeof res.stderr.text === 'string' ? res.stderr.text : '',
      timedOut: Boolean(res.timedOut),
    };
  }

  /**
   * Object SHA for a ref, via `git ls-remote` — the object SHA, never the ref
   * string, so a renamed branch or tag cannot cause a false verdict.
   * @returns {Promise<{sha: string|null, error: string|null}>}
   */
  async function remoteSha(repo, ref) {
    const url = normalizeRepo(repo);
    if (!url) return { sha: null, error: 'invalid repo in .source.json' };

    const wantRef = typeof ref === 'string' && ref.length > 0 ? ref : 'HEAD';
    const key = url + '#' + wantRef;
    const hit = remoteCache.get(key);
    if (hit && Date.now() - hit.at < cacheTtlMs) return { sha: hit.sha, error: hit.error };

    const res = await runCommand('git ls-remote ' + JSON.stringify(url) + ' ' + JSON.stringify(wantRef), 15000);
    let entry;
    if (res.timedOut) {
      entry = { sha: null, error: 'git ls-remote timed out' };
    } else if (res.exitCode !== 0) {
      const reason = res.stderr.split('\n').map((l) => l.trim()).filter(Boolean).slice(-1)[0] || ('exit ' + res.exitCode);
      entry = { sha: null, error: 'git ls-remote failed: ' + reason.slice(0, 140) };
    } else {
      const line = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean)[0];
      if (!line) entry = { sha: null, error: 'ref not found: ' + wantRef };
      else {
        const sha = line.split(/\s+/)[0];
        entry = /^[0-9a-f]{7,40}$/i.test(sha)
          ? { sha, error: null }
          : { sha: null, error: 'unparseable ls-remote output' };
      }
    }
    remoteCache.set(key, { at: Date.now(), sha: entry.sha, error: entry.error });
    return entry;
  }

  async function scanSkill(root, dirName, home) {
    const dir = root + '/' + dirName;
    const mdPath = dir + '/SKILL.md';
    const text = await readTextOrNull(mdPath);
    if (text === null) return null;

    const fm = parseFrontmatter(text);
    const description = typeof fm.description === 'string' && fm.description.length > 0
      ? collapse(fm.description).slice(0, 600)
      : null;
    const source = await readJsonOrNull(dir + '/.source.json');

    const row = {
      name: typeof fm.name === 'string' && fm.name.length > 0 ? fm.name : dirName,
      version: pickVersion(fm),
      description,
      summary: summarize(description, maxSummary),
      path: mdPath,
      dir,
      root,
      rootDisplay: displayPath(root, home),
      repo: null,
      ref: null,
      localSha: null,
      syncedAt: null,
      remoteSha: null,
      status: 'unmanaged',
      detail: null,
    };

    if (!source) return row;

    row.repo = str(source.repo);
    row.ref = str(source.ref) || 'HEAD';
    row.localSha = str(source.local_sha);
    row.syncedAt = str(source.synced_at);

    if (!row.repo || !row.localSha) {
      row.status = 'unknown';
      row.detail = '.source.json is missing repo or local_sha';
      return row;
    }

    const remote = await remoteSha(row.repo, row.ref);
    if (remote.error) {
      row.status = 'unknown';
      row.detail = remote.error;
      return row;
    }
    row.remoteSha = remote.sha;
    row.status = String(remote.sha).toLowerCase() === String(row.localSha).toLowerCase()
      ? 'up_to_date'
      : 'behind';
    return row;
  }

  async function scanRoot(root, home) {
    let dir;
    try {
      dir = await fs.resolve(root);
    } catch {
      return { root, status: 'absent', rows: [] };
    }
    let entries;
    try {
      entries = await fs.listDir(dir);
    } catch {
      return { root, status: 'unreadable', rows: [] };
    }
    if (!Array.isArray(entries)) return { root, status: 'unreadable', rows: [] };

    const rows = [];
    for (const e of entries) {
      const nm = e && typeof e.name === 'string' ? e.name : null;
      if (!nm || nm.startsWith('.') || nm === 'node_modules') continue;
      if (e.type && e.type !== 'directory') continue;
      const row = await scanSkill(root, nm, home);
      if (row) rows.push(row);
    }
    return { root, status: 'ok', rows };
  }

  /**
   * Scan every root and classify each skill.
   * @returns {Promise<{skills: Array<object>, roots: Array<object>, summary: object, note: string|null}>}
   */
  async function poll(request) {
    // `cwd` comes from the client's current session, so project roots follow the
    // workspace the user is actually in. Absent, the Host process cwd is used.
    const cwdOverride = (request && typeof request.cwd === 'string' && request.cwd.length > 0)
      ? request.cwd
      : undefined;
    const { roots, home, projectRoot } = await layout(cwdOverride);
    const perRoot = [];
    const seen = new Map();

    for (const root of roots) {
      const r = await scanRoot(root, home);
      let counted = 0;
      for (const row of r.rows) {
        if (seen.has(row.name)) continue;   // first root wins
        seen.set(row.name, row);
        counted += 1;
      }
      perRoot.push({
        root,
        display: displayPath(root, home),
        short: shortPath(root, home, projectRoot),
        status: r.status,
        found: r.rows.length,
        counted,
      });
    }

    const skills = Array.from(seen.values());
    const rank = { behind: 0, unknown: 1, up_to_date: 2, unmanaged: 3 };
    skills.sort((a, b) => (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name));

    const managed = skills.filter((s) => s.status !== 'unmanaged').length;
    return {
      skills,
      roots: perRoot,
      projectRoot: projectRoot ?? null,
      summary: {
        total: skills.length,
        managed,
        unmanaged: skills.length - managed,
        behind: skills.filter((s) => s.status === 'behind').length,
        upToDate: skills.filter((s) => s.status === 'up_to_date').length,
        unknown: skills.filter((s) => s.status === 'unknown').length,
      },
      note: managed === 0
        ? 'No managed skills yet. A skill becomes managed when a .source.json sits beside its SKILL.md with { repo, ref, local_sha, synced_at }.'
        : null,
    };
  }

  return { poll };
}

export const __internals = { CUT_MARKERS, BLOCK_MARKERS, normalizeRepo, collapse, displayPath, shortPath, STALE_NEVER };
