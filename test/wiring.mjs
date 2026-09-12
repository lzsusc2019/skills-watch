// Wiring test — checks the official-channel artifacts against the REAL DSH
// toolchain, not against a copy of its rules.
//
//   node test/wiring.mjs
//
// Needs `@deepseek-ai/dsh-typert-loader`, `@deepseek-ai/dsh-typert-protocol`
// and `zod` resolvable from this package. In a deployed DSH those come from the
// deployment's own install; for local work, link them into ./node_modules.
// Without them the test reports SKIP and exits 0, so a fresh clone still runs
// `node test/smoke.js` without setup.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

let validateTypertManifest;
let remoteMethods;
try {
  ({ validateTypertManifest } = await import('@deepseek-ai/dsh-typert-loader'));
  ({ remoteMethods } = await import('@deepseek-ai/dsh-typert-protocol'));
} catch (err) {
  console.log('SKIP  DSH toolchain not resolvable from this package: ' + err.message);
  console.log('      link @deepseek-ai/dsh-typert-loader, @deepseek-ai/dsh-typert-protocol and zod into ./node_modules');
  process.exit(0);
}

const pkg = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8'));
const host = await import(join(REPO, 'lib/typert.host.js'));
const remote = await import(join(REPO, 'lib/typert.remote-client.js'));
const mod = await import(join(REPO, 'lib/index.js'));

const failed = [];
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else {
    console.log('  FAIL  ' + label + (detail !== undefined ? '  → ' + detail : ''));
    failed.push(label);
  }
}

console.log('package: ' + pkg.name);

console.log('\n--- host manifest ---');
try {
  validateTypertManifest(pkg.name, host.TYPERT);
  check('TYPERT passes the real loader validator', true);
} catch (e) {
  check('TYPERT passes the real loader validator', false, e.message);
}

const inv = host.TYPERT.invocations[0];
check('invocation id is <pkg>#<service>/<method>', inv.id === pkg.name + '#skillsWatch/list', inv.id);
check('invocation declares exactly one parameter', inv.parameters.length === 1, inv.parameters.length);
check('the parameter is the JSON `request`', inv.parameters[0].name === 'request'
  && inv.parameters[0].wire === 'request' && inv.parameters[0].source === 'json',
  JSON.stringify(inv.parameters[0] && { name: inv.parameters[0].name, wire: inv.parameters[0].wire, source: inv.parameters[0].source }));
check('the parameter codec is strict and zod-backed',
  inv.parameters[0].codec.mode === 'strict'
  && typeof inv.parameters[0].codec.schema.parse === 'function');
check('the request schema accepts an optional cwd',
  (() => {
    const ok1 = inv.parameters[0].codec.schema.safeParse({}).success;
    const ok2 = inv.parameters[0].codec.schema.safeParse({ cwd: '/tmp/x' }).success;
    const bad = inv.parameters[0].codec.schema.safeParse({ cwd: 5 }).success;
    return ok1 && ok2 && !bad;
  })());
check('the result schema carries projectRoot',
  inv.result.schema.safeParse({
    skills: [], roots: [], projectRoot: null,
    summary: { total: 0, managed: 0, unmanaged: 0, behind: 0, upToDate: 0, unknown: 0 },
    note: null, polledAt: '2026-01-01T00:00:00Z',
  }).success);
check('result codec is strict and zod-backed',
  inv.result.mode === 'strict' && '_zod' in inv.result.schema && typeof inv.result.schema.parse === 'function');
check('manifest face is host', host.TYPERT.face === 'host');

console.log('\n--- host service ---');
check('lib/index.js default-exports a class', typeof mod.default === 'function', typeof mod.default);
check('service declares its dependencies', JSON.stringify(mod.SkillsWatchGateway.inject) === '["fs","shell"]',
  JSON.stringify(mod.SkillsWatchGateway.inject));
check('service key matches the invocation namespace', mod.SERVICE_KEY === inv.namespace, mod.SERVICE_KEY);

// The marker table is keyed by prototype, so an object made from the prototype
// is enough to read the Remote marker back — this is what proves the manual
// decorator application actually registered it.
const markerProbe = Object.create(mod.SkillsWatchGateway.prototype);
for (const init of mod.REMOTE_INITIALIZERS) init.call(markerProbe);
const methods = remoteMethods(markerProbe);
check('remoteMethods() sees exactly one Remote', methods.length === 1, JSON.stringify(methods));
check('the Remote method is "list"', methods[0] && methods[0].method === 'list', JSON.stringify(methods[0]));
check('the Remote invocation kind is "direct"',
  methods[0] && methods[0].invocation && methods[0].invocation.kind === 'direct');

console.log('\n--- client descriptors ---');
check('package name matches', remote.TYPERT_REMOTE.package === pkg.name, remote.TYPERT_REMOTE.package);
check('descriptors mirror the host invocations',
  JSON.stringify(remote.TYPERT_REMOTE.descriptors.map((d) => d.id))
  === JSON.stringify(host.TYPERT.invocations.map((d) => d.id)));
check('default export is the same object', remote.default === remote.TYPERT_REMOTE);

console.log('\n--- bundle patch ---');
try {
  const { parse } = await import('yaml');
  const patch = parse(await readFile(join(REPO, 'cordis.patch.yml'), 'utf8'));
  check('patch parses to a top-level array', Array.isArray(patch), typeof patch);
  const rows = patch[0] && patch[0].insert;
  check('patch inserts exactly one row', Array.isArray(rows) && rows.length === 1, JSON.stringify(patch[0]));
  check('the row id is skills-watch', rows && rows[0] && rows[0].id === 'skills-watch', rows && rows[0] && rows[0].id);
  check('the row name is this package', rows && rows[0] && rows[0].name === pkg.name, rows && rows[0] && rows[0].name);
  check('the row carries no config by default (defaults come from the Host process)',
    rows && rows[0] && rows[0].config === undefined);
} catch (err) {
  console.log('  SKIP  patch check (yaml not resolvable: ' + err.message + ')');
}

console.log('\n--- package.json wiring ---');
check('exports["./typert"] points at the host manifest', pkg.exports['./typert'] === './lib/typert.host.js');
check('exports["./remote"] points at the descriptors', pkg.exports['./remote'] === './lib/typert.remote-client.js');
check('exports["./client"] points at the browser half', pkg.exports['./client'] === './lib/client.js');
check('dsh.client.platform is a string', typeof pkg.dsh?.client?.platform === 'string', String(pkg.dsh?.client?.platform));
check('dsh.client.inject is a string array',
  Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.every((i) => typeof i === 'string'),
  JSON.stringify(pkg.dsh?.client?.inject));
check('zod is a v4 dependency', /^\^?4\./.test(pkg.dependencies?.zod || ''), pkg.dependencies?.zod);
check('dsh.bundle.patch points at cordis.patch.yml', pkg.dsh?.bundle?.patch === './cordis.patch.yml', pkg.dsh?.bundle?.patch);
check('cordis.patch.yml is published', (pkg.files || []).includes('cordis.patch.yml'), JSON.stringify(pkg.files));

console.log('\n' + (failed.length === 0 ? 'ALL PASS' : failed.length + ' FAILED: ' + failed.join(' | ')));
process.exit(failed.length === 0 ? 0 : 1);
