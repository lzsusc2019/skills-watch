// Smoke test for lib/scan.js — the detection core.
//
//   node test/smoke.js
//
// lib/scan.js takes its filesystem and shell as arguments, so a stub pair is
// enough to exercise every branch: SHA comparison, the three failure states,
// frontmatter parsing, description compression, root de-duplication, and the
// shell-request contract. Nothing here touches the real machine.

import { createScanner, summarize, parseFrontmatter, resolveRoots, findProjectRoot, expandHome } from '../lib/scan.js';

// ── Fixtures ───────────────────────────────────────────────────────────────
// These roots must match the scanner configuration below; a fixture placed
// anywhere else is never seen and every count comes back zero.

const HOME = '/Users/someone';
const PROJECT = HOME + '/work';
const PROJECT_ROOT = PROJECT + '/.dsh/skills';
const AGENTS_ROOT = HOME + '/.agents/skills';
// Present on disk, but its listing fails — the one case that must NOT be folded
// into `absent`.
const LOCKED_ROOT = HOME + '/locked/skills';

const FILES = {};
function put(root, name, skillMd, sourceJson) {
  FILES[root + '/' + name + '/SKILL.md'] = skillMd;
  if (sourceJson !== undefined) {
    FILES[root + '/' + name + '/.source.json'] =
      typeof sourceJson === 'string' ? sourceJson : JSON.stringify(sourceJson, null, 2);
  }
}

// up_to_date — local SHA equals the remote SHA.
put(PROJECT_ROOT, 'humanizer',
  '---\nname: humanizer\ndescription: |\n  Rewrite AI-sounding text so it reads like the writer.\n  Use when editing prose for AI tells.\nmetadata:\n  version: "3.0.0"\n---\nbody\n',
  { repo: 'blader/humanizer', ref: 'HEAD', local_sha: '9862685f575c65a8247f90369951df1b3416e3d6', synced_at: '2026-09-12T00:00:00Z' });

// behind — the recorded local SHA differs from the remote one the stub returns.
// The SHA is a FIXTURE VALUE, not a claim about this repository's history: the
// shell is stubbed, so nothing is fetched. (kepano/obsidian-skills in fact holds
// only one commit for this skill, so it cannot supply a real older version.)
// The genuine behind case — humanizer at v2.11.1 while upstream is v3.0.0, both
// real tags — is verified against the network outside this file.
put(PROJECT_ROOT, 'knap',
  '---\nname: knap\ndescription: Clean markdown render from templates and structured data.\nversion: 1.0.0\n---\nbody\n',
  { repo: 'kepano/obsidian-skills', ref: 'HEAD', local_sha: '62f144dac6cb5011d8f0574c3fed23c6565220d5', synced_at: '2026-09-12T00:00:00Z' });

// unknown — the remote lookup fails.
put(PROJECT_ROOT, 'broken-source',
  '---\nname: broken-source\ndescription: Has a bad repo field.\n---\nbody\n',
  { repo: 'nonexistent/repo-xyz', ref: 'HEAD', local_sha: 'aaaaaaa', synced_at: '2026-09-12T00:00:00Z' });

// unknown — .source.json present but incomplete.
put(PROJECT_ROOT, 'partial-source',
  '---\nname: partial-source\ndescription: This .source.json lacks local_sha.\n---\nbody\n',
  { repo: 'blader/humanizer', ref: 'HEAD' });

// unmanaged — no .source.json. CJK description with a trigger-phrase tail.
put(PROJECT_ROOT, 'adversarial-review',
  '---\nname: adversarial-review\nversion: 1.1.1\ndescription: 以攻击者视角审查 AI 交付的方案/设计/代码（AI 审 AI）。当用户说"对抗性审查"时触发。\n---\nbody\n');

// unmanaged, from the second root.
put(AGENTS_ROOT, 'find-skills',
  '---\nname: find-skills\ndescription: Helps users discover and install agent skills.\n---\nbody\n');

// A malformed .source.json must degrade to unmanaged, not crash.
put(AGENTS_ROOT, 'bad-json',
  '---\nname: bad-json\ndescription: Broken .source.json.\n---\nbody\n',
  '{ this is not json');

// A name present in both roots — the earlier root must win.
put(AGENTS_ROOT, 'humanizer',
  '---\nname: humanizer\ndescription: Shadowed copy from the second root.\n---\nbody\n');

const ROOTS = [
  PROJECT_ROOT,
  PROJECT + '/.agents/skills',   // absent
  HOME + '/.dsh/skills',         // absent
  AGENTS_ROOT,
  HOME + '/.claude/skills',      // absent
  LOCKED_ROOT,                   // present but unreadable
];

// ── Stubs ──────────────────────────────────────────────────────────────────

const shellCalls = [];

// This stub models the REAL adapter, verified against a running DSH host:
//   - resolve() succeeds even for a path that does not exist — it resolves,
//     it does not stat — so absence can never be detected from a resolve throw;
//   - listDir() rejects with `not found` for a directory that is not there;
//   - stat() resolves to undefined for a missing path, which is the documented
//     "is it there" contract and the only reliable absence signal.
// An earlier version of this stub threw from resolve() instead. That encoded
// the opposite assumption and hid a real misreport: every root that simply did
// not exist came back as `unreadable`, i.e. as a read failure that never
// happened.
const fs = {
  dirExists(p) {
    if (p === PROJECT_ROOT || p === AGENTS_ROOT) return true;
    if (p === LOCKED_ROOT) return true;
    return Object.keys(FILES).some((f) => f.startsWith(p + '/'));
  },
  async resolve(p) {
    return { path: p };
  },
  async stat(target) {
    return this.dirExists(target.path) ? { type: 'directory' } : undefined;
  },
  async listDir(target) {
    const root = target.path;
    if (!this.dirExists(root)) throw new Error('cannot list "' + root + '": not found');
    // A directory that IS there but cannot be read must stay `unreadable`: the
    // disambiguation is stat's job, not the error message's.
    if (root === LOCKED_ROOT) throw new Error('cannot list "' + root + '": permission denied');
    const names = new Set();
    for (const f of Object.keys(FILES)) {
      if (f.startsWith(root + '/')) names.add(f.slice(root.length + 1).split('/')[0]);
    }
    return Array.from(names).sort().map((n) => ({ name: n, type: 'directory', target: { path: root + '/' + n } }));
  },
  async readText(target) {
    const v = FILES[target.path];
    if (v === undefined) throw new Error('ENOENT: ' + target.path);
    return v;
  },
};

const shell = {
  resolve(req) { return req; },
  async run(spec) {
    shellCalls.push({ command: spec.command, env: spec.env, workdir: spec.workdir });
    const m = /git ls-remote (\S+) (\S+)/.exec(spec.command);
    if (!m) return { exitCode: 1, stdout: { text: '' }, stderr: { text: 'unexpected command' }, timedOut: false };
    const url = JSON.parse(m[1]);
    if (url.includes('nonexistent')) {
      return {
        exitCode: 128,
        stdout: { text: '' },
        stderr: { text: "fatal: could not read Username for 'https://github.com': terminal prompts disabled" },
        timedOut: false,
      };
    }
    if (url.includes('blader/humanizer')) {
      return { exitCode: 0, stdout: { text: '9862685f575c65a8247f90369951df1b3416e3d6\tHEAD\n' }, stderr: { text: '' }, timedOut: false };
    }
    if (url.includes('kepano/obsidian-skills')) {
      return { exitCode: 0, stdout: { text: '8ccef29ae8624eccc734e77ced4a6e54baf5d83a\tHEAD\n' }, stderr: { text: '' }, timedOut: false };
    }
    return { exitCode: 0, stdout: { text: '' }, stderr: { text: '' }, timedOut: false };
  },
};

// ── Assertions ─────────────────────────────────────────────────────────────

const failed = [];
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else {
    console.log('  FAIL  ' + label + (detail !== undefined ? '  → ' + detail : ''));
    failed.push(label);
  }
}

console.log('--- pure helpers ---');

const latin = 'Rewrite AI text so it reads like the writer. Use when editing prose.';
check('summarize drops a Latin "Use when" tail',
  summarize(latin) === 'Rewrite AI text so it reads like the writer.', summarize(latin));

const cjk = '以攻击者视角审查交付物。当用户说"验收一下"时触发。';
check('summarize drops a CJK 当用户说 tail', summarize(cjk) === '以攻击者视角审查交付物。', summarize(cjk));

check('summarize caps length with an ellipsis',
  summarize('x'.repeat(50) + ' ' + 'y'.repeat(200)).endsWith('\u2026'));
check('summarize returns null for empty input', summarize(null) === null && summarize('') === null);
check('summarize leaves a short description alone',
  summarize('Short and complete.') === 'Short and complete.', summarize('Short and complete.'));

const fm = parseFrontmatter('---\nname: a\ndescription: |\n  line one\n  line two\nmetadata:\n  version: "2.0.0"\n---\nbody');
check('block scalar is assembled into one line', fm.description === 'line one line two', fm.description);
check('nested metadata is parsed', Boolean(fm.metadata) && fm.metadata.version === '2.0.0', JSON.stringify(fm.metadata));
check('frontmatter-less text yields {}', Object.keys(parseFrontmatter('no frontmatter here')).length === 0);

console.log('\n--- scan ---');

const scanner = createScanner({ fs, shell, config: { home: HOME, project: PROJECT, roots: ROOTS } });
const out = await scanner.poll();

const MISSING = { status: '(missing)', version: null, detail: null, summary: null, localSha: null, remoteSha: null, description: null };
const by = (n) => out.skills.find((s) => s.name === n) || MISSING;

console.log('summary: ' + JSON.stringify(out.summary));
console.log('roots:');
out.roots.forEach((r) => console.log('  ' + r.short.padEnd(22) + r.status.padEnd(11) + 'found=' + r.found + ' counted=' + r.counted));
console.log('skills:');
out.skills.forEach((s) => {
  console.log('  ' + s.status.padEnd(11) + s.name.padEnd(20) +
    (s.version ? 'v' + s.version : '—').padEnd(8) +
    (s.localSha ? s.localSha.slice(0, 7) + '→' + (s.remoteSha ? s.remoteSha.slice(0, 7) : '?') : ''));
  if (s.detail) console.log('      detail:  ' + s.detail);
  if (s.summary) console.log('      summary: ' + s.summary);
});
console.log();

check('total = 7 (humanizer appears twice, de-duplicated)', out.summary.total === 7, out.summary.total);
check('managed = 4', out.summary.managed === 4, out.summary.managed);
check('unmanaged = 3', out.summary.unmanaged === 3, out.summary.unmanaged);
check('behind = 1', out.summary.behind === 1, out.summary.behind);
check('upToDate = 1', out.summary.upToDate === 1, out.summary.upToDate);
check('unknown = 2', out.summary.unknown === 2, out.summary.unknown);

check('humanizer is up_to_date', by('humanizer').status === 'up_to_date', by('humanizer').status);
check('knap is behind', by('knap').status === 'behind', by('knap').status);
check('knap reports both SHAs', Boolean(by('knap').localSha) && Boolean(by('knap').remoteSha));
check('broken-source is unknown', by('broken-source').status === 'unknown', by('broken-source').status);
check('unknown carries the git failure text',
  /git ls-remote failed/.test(by('broken-source').detail || ''), by('broken-source').detail);
check('incomplete .source.json is unknown',
  by('partial-source').status === 'unknown' && /missing repo or local_sha/.test(by('partial-source').detail || ''),
  by('partial-source').detail);
check('adversarial-review is unmanaged', by('adversarial-review').status === 'unmanaged', by('adversarial-review').status);
check('malformed .source.json degrades to unmanaged', by('bad-json').status === 'unmanaged', by('bad-json').status);

check('version read from nested metadata', by('humanizer').version === '3.0.0', by('humanizer').version);
check('version read from top level', by('knap').version === '1.0.0', by('knap').version);
check('block-scalar description assembled',
  /Rewrite AI-sounding text/.test(by('humanizer').description || ''), by('humanizer').description);
check('CJK summary drops the 当用户说 tail',
  by('adversarial-review').summary === '以攻击者视角审查 AI 交付的方案/设计/代码（AI 审 AI）。',
  by('adversarial-review').summary);

check('the earlier root wins on a duplicate name',
  /Rewrite AI-sounding/.test(by('humanizer').description || ''), by('humanizer').description);
{
  const agents = out.roots.find((r) => r.root === AGENTS_ROOT);
  check('the shadowed root reports found=3 but contributes only 2',
    agents.found === 3 && agents.counted === 2, 'found=' + agents.found + ' counted=' + agents.counted);
}

check('behind sorts first', out.skills[0].status === 'behind', out.skills[0].status);
check('absent roots are reported',
  out.roots.filter((r) => r.status === 'absent').length === 3,
  out.roots.filter((r) => r.status === 'absent').length);
check('a directory that exists but cannot be listed stays unreadable',
  out.roots.filter((r) => r.status === 'unreadable').length === 1
    && out.roots.some((r) => r.root === LOCKED_ROOT && r.status === 'unreadable'),
  JSON.stringify(out.roots.map((r) => [r.root, r.status])));
check('a missing root is never dressed up as a read failure',
  out.roots.every((r) => !(r.status === 'unreadable' && r.root !== LOCKED_ROOT)),
  JSON.stringify(out.roots.map((r) => [r.root, r.status])));
check('note is null once something is managed', out.note === null, out.note);

check('every git call sets GIT_TERMINAL_PROMPT=0',
  shellCalls.length > 0 && shellCalls.every((c) => c.env && c.env.GIT_TERMINAL_PROMPT === '0'),
  JSON.stringify(shellCalls.map((c) => c.env)));
check('shell requests use command/workdir, not argv/cwd',
  shellCalls.every((c) => typeof c.command === 'string' && /^git ls-remote /.test(c.command) && c.workdir === '/tmp'));
check('result is lossless JSON', (() => {
  try { JSON.parse(JSON.stringify(out)); return true; } catch { return false; }
})());


console.log('\n--- root resolution ---');

// A filesystem that only knows the listed paths, so `.git` probing is
// deterministic and no real directory is consulted.
function probeFs(paths) {
  const set = new Set(paths);
  return {
    async resolve(p) {
      if (!set.has(p)) throw new Error('ENOENT: ' + p);
      return { path: p };
    },
    async stat(target) {
      return set.has(target.path) ? { type: 'directory' } : undefined;
    },
  };
}

{
  const r = await resolveRoots({
    fs: probeFs(['/home/u/work/.git']),
    env: { HOME: '/home/u' },
    cwd: '/home/u/work/deep/nested',
  });
  check('project root is found by walking up to .git',
    r.roots.includes('/home/u/work/.dsh/skills') && r.roots.includes('/home/u/work/.agents/skills'),
    JSON.stringify(r.roots));
  check('user roots come from HOME', 
    r.roots.includes('/home/u/.dsh/skills') && r.roots.includes('/home/u/.agents/skills'),
    JSON.stringify(r.roots));
  check('~/.claude/skills is NOT a default root (the Harness never loads from it)',
    !r.roots.some((p) => p.includes('.claude')), JSON.stringify(r.roots));
  check('project roots are ordered before user roots',
    r.roots.indexOf('/home/u/work/.dsh/skills') < r.roots.indexOf('/home/u/.dsh/skills'),
    JSON.stringify(r.roots));
  check('the resolved projectRoot is reported back', r.projectRoot === '/home/u/work', r.projectRoot);
}

{
  const r = await resolveRoots({
    fs: probeFs(['/home/u/work/.git']),
    env: { HOME: '/home/u', DSH_HOME: '/custom/dsh', DSH_AGENTS_HOME: '/custom/agents', DSH_BUNDLED_SKILL_DIR: '/bundled/skills' },
    cwd: '/home/u/work',
  });
  check('DSH_HOME overrides the Harness home', r.roots.includes('/custom/dsh/skills'), JSON.stringify(r.roots));
  check('DSH_AGENTS_HOME overrides the agents home', r.roots.includes('/custom/agents/skills'), JSON.stringify(r.roots));
  check('DSH_BUNDLED_SKILL_DIR is scanned', r.roots.includes('/bundled/skills'), JSON.stringify(r.roots));
}

{
  const r = await resolveRoots({
    fs: probeFs(['/home/u/work/.git']),
    env: { HOME: '/home/u' },
    cwd: '/home/u/work',
    config: { roots: ['/only/this'], extraRoots: ['/plus/this'] },
  });
  check('an explicit roots list replaces the inferred one',
    r.roots.length === 2 && r.roots[0] === '/only/this' && r.roots[1] === '/plus/this',
    JSON.stringify(r.roots));
  check('the config source is reported', r.source === 'config', r.source);
}

{
  const r = await resolveRoots({
    fs: probeFs(['/home/u/work/.git']),
    env: { HOME: '/home/u' },
    cwd: '/home/u/work',
    config: { extraRoots: ['~/.claude/skills'] },
  });
  check('extraRoots appends to the defaults', r.roots.includes('/home/u/.claude/skills'), JSON.stringify(r.roots));
  check('extraRoots expands ~', !r.roots.some((p) => p.startsWith('~')), JSON.stringify(r.roots));
}

{
  const r = await resolveRoots({ fs: probeFs([]), env: { HOME: '/home/u' }, cwd: '/no/git/anywhere' });
  check('falling off the filesystem root keeps the original cwd', r.projectRoot === '/no/git/anywhere', r.projectRoot);
  check('user roots survive a cwd with no project', r.roots.includes('/home/u/.dsh/skills'), JSON.stringify(r.roots));
}

{
  const home = await findProjectRoot(probeFs(['/a/.git']), '/a/b/c');
  check('findProjectRoot walks up to the .git directory', home === '/a', home);
}

check('expandHome leaves absolute paths alone', expandHome('/abs/path', '/home/u') === '/abs/path');
check('expandHome expands a bare ~', expandHome('~', '/home/u') === '/home/u');


console.log('\n--- per-call cwd ---');

// The client passes the session's cwd, so project roots follow the workspace
// the user is actually in rather than the Host process's own directory.
{
  const gitFs = {
    async resolve(p) {
      if (p === '/repo/.git' || p.startsWith('/repo/.dsh') || p === '/repo') return { path: p };
      throw new Error('ENOENT: ' + p);
    },
    async stat(target) { return { type: 'directory' }; },
    async listDir() { return []; },
    async readText() { throw new Error('ENOENT'); },
  };
  const sc = createScanner({
    fs: gitFs,
    shell,
    env: { HOME: '/home/u' },
    cwd: '/elsewhere',
    config: {},
  });
  const out = await sc.poll({ cwd: '/repo/src' });
  const roots = out.roots.map((r) => r.root);
  check('a per-call cwd drives project-root discovery',
    roots.includes('/repo/.dsh/skills') && roots.includes('/repo/.agents/skills'),
    JSON.stringify(roots));
  check('the resolved projectRoot is reported in the result', out.projectRoot === '/repo', out.projectRoot);
  check('user roots are still included', roots.includes('/home/u/.dsh/skills'), JSON.stringify(roots));
}

{
  // Two different workspaces must not share a cached layout.
  const gitFs = {
    async resolve(p) { return { path: p }; },
    async stat(target) {
      return (target.path === '/repoA/.git' || target.path === '/repoB/.git') ? { type: 'directory' } : undefined;
    },
    async listDir() { return []; },
    async readText() { throw new Error('ENOENT'); },
  };
  const sc = createScanner({ fs: gitFs, shell, env: { HOME: '/home/u' }, cwd: '/nowhere', config: {} });
  const a = await sc.poll({ cwd: '/repoA/x' });
  const b = await sc.poll({ cwd: '/repoB/y' });
  check('switching workspace re-resolves the roots',
    a.projectRoot === '/repoA' && b.projectRoot === '/repoB',
    a.projectRoot + ' / ' + b.projectRoot);
  const a2 = await sc.poll({ cwd: '/repoA/x' });
  check('the same workspace reuses the cached layout', a2.projectRoot === '/repoA', a2.projectRoot);
}

console.log('\n' + (failed.length === 0 ? 'ALL PASS' : failed.length + ' FAILED: ' + failed.join(' | ')));
process.exit(failed.length === 0 ? 0 : 1);
