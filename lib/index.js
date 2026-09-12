// Host half — the official package entry (`exports["."]`).
//
// A Cordis Service that exposes one Typert Remote method, `skillsWatch.list()`.
// The browser half reaches it through the descriptors in
// ./typert.remote-client.js, mounted with `ctx.remote.$mount(...)`.
//
// The decorator is applied manually instead of with `@Remote(...)` syntax, so
// this package needs no decorator build step. See applyRemoteDecorator below.

import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createScanner } from './scan.js';

/** Exact service key, also the default wire namespace. */
export const SERVICE_KEY = 'skillsWatch';

/**
 * Apply a standard method decorator without decorator syntax.
 *
 * A method decorator is invoked as `(method, context)`, where `context` carries
 * `kind`, `name`, `static`, `private`, `access`, and `addInitializer`. It
 * records an initializer; running that initializer against a live instance is
 * what writes the Remote marker onto the instance's prototype. The class
 * constructor therefore has to run every initializer it collected.
 *
 * @param {object} proto - prototype owning the method.
 * @param {string} name - method name.
 * @param {Function} decorator - e.g. `Remote('list')`.
 * @returns {Function[]} initializers for the constructor to run.
 */
export function applyRemoteDecorator(proto, name, decorator) {
  const initializers = [];
  decorator(proto[name], {
    kind: 'method',
    name,
    static: false,
    private: false,
    access: {
      has: (obj) => name in obj,
      get: (obj) => obj[name],
    },
    addInitializer(fn) {
      if (typeof fn === 'function') initializers.push(fn);
    },
  });
  return initializers;
}

/**
 * Remote-only service reporting every installed skill and whether the managed
 * ones have fallen behind their upstream repository.
 *
 * The scan runs per call: it is cheap next to the network round trip, and the
 * scanner caches `git ls-remote` results for 24h, so repeated calls in one
 * process do not re-hit the network.
 */
class SkillsWatchGateway extends TypertRemoteService {
  static inject = ['fs', 'shell'];

  /**
   * @param {object} ctx - owning Host context.
   * @param {{home?: string, project?: string, roots?: string[], cacheTtlMs?: number, maxSummary?: number}} [config]
   */
  constructor(ctx, config = {}) {
    super(ctx, SERVICE_KEY);
    // Write the Remote markers now that a live instance exists.
    for (const init of REMOTE_INITIALIZERS) init.call(this);
    this.scanner = createScanner({ fs: ctx.fs, shell: ctx.shell, config });
  }

  /**
   * Current skill inventory with per-skill upstream state.
   * @returns {Promise<object>} lossless-JSON snapshot: skills, roots, summary, note, polledAt.
   */
  async list() {
    const r = await this.scanner.poll();
    return {
      skills: r.skills,
      roots: r.roots,
      summary: r.summary,
      note: r.note,
      polledAt: new Date().toISOString(),
    };
  }
}

// Evaluated once at module load. `SkillsWatchGateway.prototype` exists here, and
// no instance can be constructed before this module finishes evaluating.
const REMOTE_INITIALIZERS = applyRemoteDecorator(
  SkillsWatchGateway.prototype,
  'list',
  Remote('list'),
);

export { SkillsWatchGateway, REMOTE_INITIALIZERS };
export default SkillsWatchGateway;
