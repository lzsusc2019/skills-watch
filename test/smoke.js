// Smoke test for plugin/host.js.
//
//   node test/smoke.js
//
// No dependencies. The Host half talks only to `ctx.fs`, `ctx.shell`, and the
// `harness` builtin, so a stub triple is enough to exercise every branch of the
// detection logic: SHA comparison, the three failure states, YAML parsing, and
// description compression.
//
// The stub owns the filesystem entirely, so nothing here touches the real
// machine and the hard-coded paths in host.js do not matter.

const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'host.js'), 'utf8');

// ── Fake filesystem ────────────────────────────────────────────────────────

// These MUST match the Configuration block in plugin/host.js. The Host half
// scans its own configured roots, so fixtures placed anywhere else are never
// seen and every count comes back zero — which is how a drift shows up here.
const HOME = '/Users/taozi';
const PROJECT = HOME + '/Documents/personal';
const PROJECT_ROOT = PROJECT + '/.dsh/skills';
const AGENTS_ROOT = HOME + '/.agents/skills';

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

// behind — local SHA is an older commit.
put(PROJECT_ROOT, 'knap',
  '---\nname: knap\ndescription: Clean markdown render from templates and structured data.\nversion: 1.0.0\n---\nbody\n',
  { repo: 'kepano/obsidian-skills', ref: 'HEAD', local_sha: '62f144dac6cb5011d8f0574c3fed23c6565220d5', synced_at: '2026-09-12T00:00:00Z' });

// unknown — the remote lookup fails.
put(PROJECT_ROOT, 'broken-source',
  '---\nname: broken-source\ndescription: Has a bad repo field.\n---\nbody\n',
  { repo: 'nonexistent/repo-xyz', ref: 'HEAD', local_sha: 'aaaaaaa', synced_at: '2026-09-12T00:00:00Z' });

// unmanaged — no .source.json. Description is CJK with a trigger-phrase tail.
put(PROJECT_ROOT, 'adversarial-review',
  '---\nname: adversarial-review\nversion: 1.1.1\ndescription: 以攻击者视角审查 AI 交付的方案/设计/代码（AI 审 AI）。当用户说"对抗性审查"时触发。\n---\nbody\n');

// unmanaged, from the second root.
put(AGENTS_ROOT, 'find-skills',
  '---\nname: find-skills\ndescription: Helps users discover and install agent skills.\n---\nbody\n');

// Malformed .source.json must degrade to unmanaged rather than crash.
put(AGENTS_ROOT, 'bad-json',
  '---\nname: bad-json\ndescription: Broken .source.json.\n---\nbody\n',
  '{ this is not json');

const ROOTS = [
  PROJECT_ROOT,
  PROJECT + '/.agents/skills',
  HOME + '/.dsh/skills',
  AGENTS_ROOT,
  HOME + '/.claude/skills',
];

// ── Stub ctx + harness ─────────────────────────────────────────────────────

let handler = null;
const shellCalls = [];

const ctx = {
  fs: {
    async resolve(p) {
      const exists = (p in FILES) || p === PROJECT_ROOT || p === AGENTS_ROOT;
      if (!exists) throw new Error('ENOENT: ' + p);
      return { path: p };
    },
    async listDir(target) {
      const root = target.path;
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
    async stat() { return undefined; },
  },
  shell: {
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
  },
  effect(fn) { fn(); },
};

const harness = {
  handle(name, fn) { handler = { name, fn }; return () => {}; },
};

// ── Run ────────────────────────────────────────────────────────────────────

const plugin = new Function('harness', src)(harness);

const failed = [];
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { console.log('  FAIL  ' + label + (detail !== undefined ? '  → ' + detail : '')); failed.push(label); }
}

console.log('inject: ' + JSON.stringify(plugin.inject));
plugin.apply(ctx);
check('registers the skills-poll handler', handler !== null && handler.name === 'skills-poll');

(async () => {
  const out = await handler.fn({});
  const by = (n) => out.skills.find((s) => s.name === n) || { status: '(missing)', version: null, detail: null, summary: null, localSha: null, remoteSha: null };

  console.log('\nsummary: ' + JSON.stringify(out.summary));
  console.log('\nroots:');
  out.roots.forEach((r) => console.log('  ' + r.short.padEnd(24) + r.status.padEnd(10) + 'found=' + r.found + ' counted=' + r.counted));
  console.log('\nskills:');
  out.skills.forEach((s) => {
    console.log('  ' + s.status.padEnd(11) + s.name.padEnd(20) +
      (s.version ? 'v' + s.version : '—').padEnd(8) +
      (s.localSha ? s.localSha.slice(0, 7) + '→' + (s.remoteSha ? s.remoteSha.slice(0, 7) : '?') : ''));
    if (s.detail) console.log('      detail:  ' + s.detail);
    if (s.summary) console.log('      summary: ' + s.summary);
  });

  console.log('\nassertions:');

  // Aggregate counts.
  check('total = 6', out.summary.total === 6, out.summary.total);
  check('managed = 3', out.summary.managed === 3, out.summary.managed);
  check('unmanaged = 3', out.summary.unmanaged === 3, out.summary.unmanaged);
  check('behind = 1', out.summary.behind === 1, out.summary.behind);
  check('upToDate = 1', out.summary.upToDate === 1, out.summary.upToDate);
  check('unknown = 1', out.summary.unknown === 1, out.summary.unknown);

  // Per-state behaviour.
  check('humanizer is up_to_date', by('humanizer').status === 'up_to_date', by('humanizer').status);
  check('knap is behind', by('knap').status === 'behind', by('knap').status);
  check('knap reports both SHAs', !!by('knap').localSha && !!by('knap').remoteSha);
  check('broken-source is unknown', by('broken-source').status === 'unknown', by('broken-source').status);
  check('unknown carries the git failure text',
    /git ls-remote failed/.test(by('broken-source').detail || ''), by('broken-source').detail);
  check('adversarial-review is unmanaged', by('adversarial-review').status === 'unmanaged', by('adversarial-review').status);
  check('bad .source.json degrades to unmanaged', by('bad-json').status === 'unmanaged', by('bad-json').status);

  // frontmatter parsing.
  check('version read from nested metadata', by('humanizer').version === '3.0.0', by('humanizer').version);
  check('version read from top level', by('knap').version === '1.0.0', by('knap').version);
  check('block-scalar description assembled',
    /Rewrite AI-sounding text/.test(by('humanizer').description || ''), by('humanizer').description);

  // description compression.
  check('Latin summary drops the "Use when" tail',
    by('humanizer').summary === 'Rewrite AI-sounding text so it reads like the writer.', by('humanizer').summary);
  check('CJK summary drops the 当用户说 tail',
    by('adversarial-review').summary === '以攻击者视角审查 AI 交付的方案/设计/代码（AI 审 AI）。', by('adversarial-review').summary);

  // Ordering and roots.
  check('behind sorts first', out.skills[0].status === 'behind', out.skills[0].status);
  check('absent roots are reported',
    out.roots.filter((r) => r.status === 'absent').length === 3,
    out.roots.filter((r) => r.status === 'absent').length);

  // Interface contracts that were expensive to discover.
  check('every git call sets GIT_TERMINAL_PROMPT=0',
    shellCalls.length > 0 && shellCalls.every((c) => c.env && c.env.GIT_TERMINAL_PROMPT === '0'),
    JSON.stringify(shellCalls.map((c) => c.env)));
  check('shell requests use command/workdir, not argv/cwd',
    shellCalls.every((c) => typeof c.command === 'string' && /^git ls-remote /.test(c.command) && c.workdir === '/tmp'));
  check('RPC result is lossless JSON',
    (() => { try { JSON.parse(JSON.stringify(out)); return true; } catch { return false; } })());

  console.log('\n' + (failed.length === 0 ? 'ALL PASS' : failed.length + ' FAILED: ' + failed.join(' | ')));
  process.exit(failed.length === 0 ? 0 : 1);
})();
