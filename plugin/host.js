// skills-watch — Host half
//
// Runs in the DSH Node process. One Package-private RPC (`skills-poll`) that
// scans the skill roots and reports each skill's state:
//
//   up_to_date  managed, and .source.json's local_sha === the remote SHA
//   behind      managed, and the two SHAs differ
//   unknown     managed, but the remote check failed (never treated as stale)
//   unmanaged   no .source.json beside SKILL.md — not part of staleness checks
//
// Load it by passing this file's body as `code.host` to cordis_define. The
// Client half lives in client.js and is passed as `code.client`.

return {
  inject: ['fs', 'shell'],
  apply(ctx) {
    const fs = ctx.fs;
    const shell = ctx.shell;

    // ─── Configuration ────────────────────────────────────────────────────
    // Edit these two constants for your machine.
    //   HOME    — user home directory
    //   PROJECT — the session workspace root, i.e. the directory that holds
    //             `.dsh/skills`. Roots are scanned in order and the FIRST root
    //             to supply a given skill name wins.
    const HOME = '/Users/taozi';
    const PROJECT = HOME + '/Documents/personal';

    const ROOTS = [
      PROJECT + '/.dsh/skills',
      PROJECT + '/.agents/skills',
      HOME + '/.dsh/skills',
      HOME + '/.agents/skills',
      HOME + '/.claude/skills',
    ];

    // Remote SHAs are cached for this long so repeated checks stay off the
    // network.
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const remoteCache = new Map();

    // ─── Description compression ──────────────────────────────────────────
    // A SKILL.md description is usually a purpose sentence followed by a long
    // trigger-phrase list. The panel shows only the purpose sentence and keeps
    // the full text in the tooltip.
    const MAX_SUMMARY = 100;

    const CUT_MARKERS = [
      'Use this skill when', 'Use this skill for', 'Use when the user',
      'Use instead of', 'Also use when', 'Triggers on', 'Trigger on',
      'Use when', 'Use for', 'Use it when', 'Use if the user',
      '当用户说', '当用户提到', '当用户询问', '当用户要求', '当用户上传',
      '触发场景', '触发条件', '适用场景', '使用场景',
      '注意：', 'NOTE:',
    ];

    // ─── frontmatter ──────────────────────────────────────────────────────
    // Deliberately not a YAML parser. It handles the two shapes that actually
    // appear in SKILL.md files:
    //   description: |          (block scalar, indented body)
    //   metadata:
    //     version: "3.0.0"      (one level of nesting)
    const BLOCK_MARKERS = ['|', '>', '|-', '>-', '|+', '>+'];

    function displayPath(p) {
      if (p.indexOf(HOME + '/') === 0) return '~/' + p.slice(HOME.length + 1);
      return p;
    }

    function shortPath(p) {
      if (p.indexOf(PROJECT + '/') === 0) return 'personal/' + p.slice(PROJECT.length + 1);
      if (p.indexOf(HOME + '/') === 0) return '~/' + p.slice(HOME.length + 1);
      const segs = p.split('/').filter(Boolean);
      return segs.slice(-2).join('/');
    }

    function unquote(v) {
      if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
      if (v.length > 1 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
      return v;
    }
    function collapse(s) { return String(s).replace(/\s+/g, ' ').trim(); }

    function isCJK(ch) {
      const c = ch.codePointAt(0);
      return (c >= 0x3000 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef);
    }

    function summarize(desc) {
      if (!desc) return null;
      let s = collapse(desc);
      if (s.length === 0) return null;

      // 1. drop the trigger-phrase tail
      let cut = s.length;
      for (const m of CUT_MARKERS) {
        const idx = s.indexOf(m);
        if (idx > 8 && idx < cut) cut = idx;
      }
      s = s.slice(0, cut).trim();
      if (s.length === 0) s = collapse(desc);

      // 2. keep the first sentence
      const cjk = s.match(/^[\s\S]*?[。！？；]/);
      if (cjk && cjk[0].length >= 12) s = cjk[0];
      else {
        const latin = s.match(/^[\s\S]*?[.!?;](?=\s|$)/);
        if (latin && latin[0].length >= 12) s = latin[0];
      }
      s = s.trim();

      // 3. cap the length, backing off to a word boundary for Latin text
      if (s.length > MAX_SUMMARY) {
        let head = s.slice(0, MAX_SUMMARY);
        const last = head.charAt(head.length - 1);
        if (!isCJK(last)) {
          const sp = head.lastIndexOf(' ');
          if (sp > MAX_SUMMARY - 20) head = head.slice(0, sp);
        }
        s = head.replace(/[,;:\s]+$/, '') + '\u2026';
      }
      s = s.replace(/[.。]\u2026$/, '\u2026');
      return s;
    }

    function parseFrontmatter(text) {
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

        if (BLOCK_MARKERS.indexOf(val) !== -1) {
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
          out[key] = ''; i += 1; continue;
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

    // ─── fs helpers ───────────────────────────────────────────────────────
    // ctx.fs.stat exists but returns { version, type, size } — there is NO
    // mtime, and `version` is an opaque token, so file age cannot be derived
    // from it.
    async function readTextOrNull(p) {
      try {
        const t = await fs.resolve(p);
        const text = await fs.readText(t);
        return typeof text === 'string' ? text : null;
      } catch (_) { return null; }
    }

    async function readJsonOrNull(p) {
      const text = await readTextOrNull(p);
      if (text === null) return null;
      try { return JSON.parse(text); } catch (_) { return null; }
    }

    // ─── shell ────────────────────────────────────────────────────────────
    // ShellExecRequest is { command, workdir?, timeoutMs?, ... } — NOT argv/cwd.
    // ShellRunResult.stdout is { text, truncated, spillPath? }.
    async function runCommand(command, timeoutMs) {
      const spec = shell.resolve({
        command: command,
        workdir: '/tmp',
        timeoutMs: timeoutMs || 12000,
        env: { GIT_TERMINAL_PROMPT: '0' },
      });
      const res = await shell.run(spec);
      return {
        exitCode: res.exitCode,
        stdout: (res.stdout && typeof res.stdout.text === 'string') ? res.stdout.text : '',
        stderr: (res.stderr && typeof res.stderr.text === 'string') ? res.stderr.text : '',
        timedOut: !!res.timedOut,
      };
    }

    function normalizeRepo(repo) {
      if (typeof repo !== 'string' || repo.length === 0) return null;
      if (/^https?:\/\//.test(repo) || /^git@/.test(repo) || /^ssh:\/\//.test(repo)) return repo;
      return 'https://github.com/' + repo.replace(/^\/+/, '') + '.git';
    }

    // Object SHA for a ref, via `git ls-remote` — never the ref string itself.
    async function remoteSha(repo, ref) {
      const url = normalizeRepo(repo);
      if (!url) return { error: 'invalid repo in .source.json' };
      const wantRef = (typeof ref === 'string' && ref.length > 0) ? ref : 'HEAD';
      const key = url + '#' + wantRef;
      const hit = remoteCache.get(key);
      if (hit && (Date.now() - hit.at) < CACHE_TTL_MS) return hit;

      const res = await runCommand('git ls-remote ' + JSON.stringify(url) + ' ' + JSON.stringify(wantRef), 15000);
      let entry;
      if (res.timedOut) {
        entry = { error: 'git ls-remote timed out' };
      } else if (res.exitCode !== 0) {
        const reason = (res.stderr || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(-1)[0] || ('exit ' + res.exitCode);
        entry = { error: 'git ls-remote failed: ' + reason.slice(0, 140) };
      } else {
        const line = (res.stdout || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean)[0];
        if (!line) entry = { error: 'ref not found: ' + wantRef };
        else {
          const sha = line.split(/\s+/)[0];
          entry = /^[0-9a-f]{7,40}$/i.test(sha) ? { sha: sha } : { error: 'unparseable ls-remote output' };
        }
      }
      const stored = { at: Date.now(), sha: entry.sha || null, error: entry.error || null };
      remoteCache.set(key, stored);
      return stored;
    }

    // ─── scan ─────────────────────────────────────────────────────────────
    async function scanSkill(root, dirName) {
      const dir = root + '/' + dirName;
      const mdPath = dir + '/SKILL.md';
      const text = await readTextOrNull(mdPath);
      if (text === null) return null;

      const fm = parseFrontmatter(text);
      const description = (typeof fm.description === 'string' && fm.description.length > 0)
        ? collapse(fm.description).slice(0, 600) : null;
      const source = await readJsonOrNull(dir + '/.source.json');

      const row = {
        name: (typeof fm.name === 'string' && fm.name.length > 0) ? fm.name : dirName,
        version: pickVersion(fm),
        description: description,
        summary: summarize(description),
        path: mdPath,
        dir: dir,
        root: root,
        rootDisplay: displayPath(root),
        repo: null, ref: null, localSha: null, syncedAt: null, remoteSha: null,
        status: 'unmanaged', detail: null,
      };

      if (!source || typeof source !== 'object') return row;

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
      row.status = (String(remote.sha).toLowerCase() === String(row.localSha).toLowerCase())
        ? 'up_to_date' : 'behind';
      return row;
    }

    async function scanRoot(root) {
      let dir;
      try { dir = await fs.resolve(root); } catch (_) { return { root: root, status: 'absent', rows: [] }; }
      let entries;
      try { entries = await fs.listDir(dir); } catch (_) { return { root: root, status: 'unreadable', rows: [] }; }
      if (!Array.isArray(entries)) return { root: root, status: 'unreadable', rows: [] };

      const rows = [];
      for (const e of entries) {
        const nm = (e && typeof e.name === 'string') ? e.name : null;
        if (!nm || nm.startsWith('.') || nm === 'node_modules') continue;
        if (e.type && e.type !== 'directory') continue;
        const row = await scanSkill(root, nm);
        if (row) rows.push(row);
      }
      return { root: root, status: 'ok', rows: rows };
    }

    async function poll() {
      const perRoot = [];
      const seen = new Map();

      for (const root of ROOTS) {
        const r = await scanRoot(root);
        const counted = [];
        for (const row of r.rows) {
          if (seen.has(row.name)) continue;   // first root wins
          seen.set(row.name, row);
          counted.push(row.name);
        }
        perRoot.push({
          root: root,
          display: displayPath(root),
          short: shortPath(root),
          status: r.status,
          found: r.rows.length,
          counted: counted.length,
        });
      }

      const rows = Array.from(seen.values());
      const rank = { behind: 0, unknown: 1, up_to_date: 2, unmanaged: 3 };
      rows.sort(function (a, b) { return (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name); });

      const managed = rows.filter(function (r) { return r.status !== 'unmanaged'; }).length;
      return {
        rows: rows,
        roots: perRoot,
        summary: {
          total: rows.length,
          managed: managed,
          unmanaged: rows.length - managed,
          behind: rows.filter(function (r) { return r.status === 'behind'; }).length,
          upToDate: rows.filter(function (r) { return r.status === 'up_to_date'; }).length,
          unknown: rows.filter(function (r) { return r.status === 'unknown'; }).length,
        },
        note: managed === 0
          ? 'No managed skills yet. A skill becomes managed when a .source.json sits beside its SKILL.md with { repo, ref, local_sha, synced_at }.'
          : null,
      };
    }

    // ─── RPC ──────────────────────────────────────────────────────────────
    // Output must be lossless JSON: plain objects, no NaN/Infinity, no class
    // instances.
    const off = harness.handle('skills-poll', async function () {
      try {
        const r = await poll();
        return {
          summary: r.summary,
          skills: r.rows,
          roots: r.roots,
          note: r.note,
          polledAt: new Date().toISOString(),
          error: null,
        };
      } catch (e) {
        return {
          summary: { total: 0, managed: 0, unmanaged: 0, behind: 0, upToDate: 0, unknown: 0 },
          skills: [],
          roots: [],
          note: null,
          polledAt: new Date().toISOString(),
          error: (e && e.message) ? String(e.message) : String(e),
        };
      }
    });
    ctx.effect(function () { return off; }, 'skills-watch-poll-rpc');
  },
};
