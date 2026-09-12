// Client Typert Remote descriptors — the package's `exports["./remote"]` artifact.
//
// The browser half mounts this with `ctx.remote.$mount(TYPERT_REMOTE)`, which
// installs a real `remote.skillsWatch` service whose `list()` calls the host
// method. No JavaScript Proxy is involved in method lookup.
//
// Hand-written to the exact shape produced by @deepseek-ai/dsh-typert-generator
// (compare @deepseek-ai/dsh-host-plugin-inventory/lib/typert.remote-client.js):
// the descriptors are identical to the host manifest's `invocations`, wrapped in
// `descriptors` instead of `invocations`. Keep the two files in sync.

import { TYPERT } from './typert.host.js';

export const TYPERT_REMOTE = {
  package: TYPERT.package,
  descriptors: TYPERT.invocations,
};

export default TYPERT_REMOTE;
