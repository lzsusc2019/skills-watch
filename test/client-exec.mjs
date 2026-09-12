#!/usr/bin/env node
/**
 * Executes lib/client.js the way the browser's module table does.
 *
 * Why this file exists: test/wiring.mjs validates the *shape* of the client
 * artifact (package.json wiring, descriptor fields, require allowlist), but it
 * never runs it. v0.18.2 shipped a top-level temporal-dead-zone bug —
 * `const TYPERT_REMOTE = {... schema: requestSchema ...}` was initialized before
 * the `const requestSchema` declaration that follows it — so the module threw
 * `Cannot access 'requestSchema' before initialization` at import time and the
 * whole loader entry failed. No amount of shape checking finds that.
 *
 * So this harness reproduces the real activation path, end to end:
 *
 *   1. evaluate lib/client.js in a bare context that has only `window`, so any
 *      top-level crash (TDZ, missing global) surfaces exactly as it does in the
 *      browser;
 *   2. hand the factory a `require` that serves ONLY the platform module table
 *      (react / react-dom / react/jsx-runtime) and throws the loader's own
 *      "missed the module table" error for anything else — the guard that would
 *      have caught the v0.18.1 `require("zod")` failure;
 *   3. call apply() against stub `slots` / `remote` / `effect` services and let
 *      the mount effect run, which drives ctx.remote.$mount + the first poll;
 *   4. exercise the codecs through the descriptors the Host actually receives;
 *   5. really render both slot components with react-dom/server and assert on
 *      the markup, including the panel after simulating a badge click.
 *
 * Skips (exit 0) when react cannot be resolved, mirroring test/wiring.mjs.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
// SKILLS_WATCH_ROOT lets this test run against an installed copy instead of the
// checkout — the only way to prove that what a profile actually loads is the
// artifact this test passes on.
const root = process.env.SKILLS_WATCH_ROOT
	? resolve(process.env.SKILLS_WATCH_ROOT)
	: resolve(here, "..");

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
	if (cond) {
		pass += 1;
		console.log("  PASS  " + name);
	} else {
		fail += 1;
		failures.push(name);
		console.log("  FAIL  " + name + (detail === undefined ? "" : "\n          " + detail));
	}
}
function throwsWith(fn, needle) {
	try {
		fn();
	} catch (err) {
		const msg = err && err.message ? String(err.message) : String(err);
		return msg.includes(needle) ? true : "threw, but message was: " + msg;
	}
	return "did not throw";
}

// ── Resolve react / react-dom from any reachable platform install ──────────
// The repo keeps no runtime deps; these come from the DSH deployment or the
// profile that installed this package. Any of them is fine.
const candidates = [
	root,
	process.env.DSH_DEPLOYMENT_ROOT,
	join(process.env.HOME || "", ".dsh/profiles/web/node_modules"),
	join(process.env.HOME || "", ".dsh/profiles/node_modules"),
	join(process.env.HOME || "", ".npm/_npx/1e7f6d9597241db0/node_modules"),
].filter(Boolean);

function resolveFrom(id) {
	for (const base of candidates) {
		try {
			return createRequire(join(base, "noop.js")).resolve(id);
		} catch {
			/* try the next base */
		}
	}
	return undefined;
}

const reactPath = resolveFrom("react");
const reactDomServerPath = resolveFrom("react-dom/server");

if (reactPath === undefined || reactDomServerPath === undefined) {
	console.log("SKIP  react / react-dom/server not resolvable from this checkout — skipping client execution test");
	process.exit(0);
}

const realReact = createRequire(join(root, "noop.js"))(reactPath);
const { renderToStaticMarkup } = createRequire(join(root, "noop.js"))(reactDomServerPath);

// ── The platform module table ──────────────────────────────────────────────
// dsh-client-modules seeds these words. Everything else must come from a
// registered dsh.client factory, which this package deliberately does not have.
const table = new Map([
	["react", realReact],
	["react-dom", resolveFrom("react-dom")],
	["react/jsx-runtime", resolveFrom("react/jsx-runtime")],
]);

function requireFromTable(id) {
	if (table.has(id)) return table.get(id);
	throw new Error(
		'client-modules: require("' + id + '") missed the module table — not a platform seed word, '
		+ "not a shell-own module, and no registered factory",
	);
}

// ── 1. Evaluate the artifact in a bare context ─────────────────────────────
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const src = readFileSync(join(root, "lib/client.js"), "utf8");

let spec;
const sandbox = {
	window: { __ModuleLoader__: { load(s) { spec = s; } } },
	console,
};
vm.createContext(sandbox);

let evalError = null;
try {
	vm.runInContext(src, sandbox, { filename: "lib/client.js" });
} catch (err) {
	evalError = err;
}

check(
	"the artifact body evaluates in a bare window context (no missing global at script level)",
	evalError === null,
	evalError === null ? undefined : String(evalError && evalError.message),
);

if (evalError !== null) {
	console.log("\n" + fail + " failed, " + pass + " passed — aborting, nothing below can run.");
	process.exit(1);
}

check("the artifact registers exactly one loader spec", spec !== undefined && spec !== null);
check('the spec id is the package name', spec && spec.id === pkg.name, "got " + JSON.stringify(spec && spec.id));
check("the spec exposes a factory", spec && typeof spec.factory === "function");

// ── 2. Build the module through the real module table ──────────────────────
// createElement is wrapped so the test can reach the badge's onClick handler
// afterwards — React elements are opaque, and the panel only renders when the
// store is open, which only a click can do.
const clicks = [];
const ReactShim = { ...realReact };
ReactShim.createElement = function (type, props, ...children) {
	const el = realReact.createElement(type, props, ...children);
	if (props && typeof props.onClick === "function") clicks.push({ onClick: props.onClick, props });
	return el;
};
/** Find a captured click handler by a substring of its element's title. */
function clickTitled(needle) {
	return clicks.find((c) => typeof c.props.title === "string" && c.props.title.includes(needle));
}
table.set("react", ReactShim);

let mod = null;
let buildError = null;
try {
	mod = spec.factory(requireFromTable);
} catch (err) {
	buildError = err;
}
check(
	"the factory runs under the real module table",
	buildError === null,
	buildError === null ? undefined : String(buildError && buildError.message),
);
if (buildError !== null) process.exit(1);

check("the module exports a service name list", Array.isArray(mod.inject), "got " + JSON.stringify(mod.inject));
check(
	"inject names the cordis services the client needs",
	Array.isArray(mod.inject) && mod.inject.includes("slots") && mod.inject.includes("remote"),
	JSON.stringify(mod.inject),
);
check("the module exports apply()", typeof mod.apply === "function");

// ── 3. Apply against stub services, and let the mount effect run ───────────
const FIXTURE = {
	skills: [
		{
			name: "humanizer", status: "up_to_date", repo: "https://github.com/x/humanizer",
			localSha: "9862685f1234567890", remoteSha: "9862685f1234567890",
			path: "/h/.dsh/skills/humanizer/SKILL.md", dir: "/h/.dsh/skills/humanizer",
			version: "1.2.0", summary: "Rewrite AI-sounding text so it reads like the writer.",
		},
		{
			name: "knap", status: "behind", repo: "https://github.com/x/knap",
			localSha: "62f144da1234567890", remoteSha: "9ab34cd01234567890",
			path: "/h/.dsh/skills/knap/SKILL.md", dir: "/h/.dsh/skills/knap",
			summary: "Render Markdown from templates.",
		},
		{ name: "local-only", status: "unmanaged", path: "/h/.dsh/skills/local-only/SKILL.md", dir: "/h/.dsh/skills/local-only" },
		{ name: "flaky", status: "unknown", detail: "network unreachable", path: "/h/.dsh/skills/flaky/SKILL.md", dir: "/h/.dsh/skills/flaky" },
	],
	roots: [
		{ root: "/h/.dsh/skills", short: "~/.dsh/skills", display: "~/.dsh/skills", status: "ok", counted: 4, found: 4 },
		{ root: "/h/.agents/skills", short: "~/.agents/skills", display: "~/.agents/skills", status: "absent", counted: 0, found: 0 },
	],
	projectRoot: "/Users/taozi/Documents/personal",
	summary: { total: 4, managed: 3, unmanaged: 1, upToDate: 1, behind: 1, unknown: 1 },
	note: null,
	polledAt: "2026-01-01T00:00:00.000Z",
};

const registered = [];
const mounted = [];
const listCalls = [];
const effectRuns = [];

// Faithful stub of the two services this package consumes.
//
// The namespace deliberately hangs off `ctx.reflect.get("remote.skillsWatch")`
// and NOT off the `remote` service. api-gateway registers each mounted
// namespace as its own Cordis Service under the key `remote.<namespace>`, and
// ClientRemoteService exposes no getter for it — reading `ctx.remote.skillsWatch`
// is rejected outright by the inject guard. Providing it here would re-encode
// the exact mistake that shipped in v0.18.3.
//
// The reply is likewise wrapped in the real Result envelope
// (`{ ok: true, value }`), which is what api-gateway's install() resolves with.
// Returning the bare snapshot here would hide the second v0.18.3 mistake: the
// client read `.skills` straight off the envelope and drew an empty table.
const namespaceService = {
	async list(request) { listCalls.push(request); return { ok: true, value: FIXTURE }; },
};

const ctx = {
	slots: {
		inject(name, cb) { return cb(); },
		register(meta, Component) {
			registered.push({ meta, Component });
			return function dispose() {};
		},
	},
	remote: {
		async $mount(descriptors) { mounted.push(descriptors); return function dispose() {}; },
		// Poisoned on purpose: the namespace is a separate service under
		// `remote.<namespace>`, never a property of `remote`. v0.18.3 read this
		// and silently got undefined; anything that touches it now fails loudly.
		get skillsWatch() {
			throw new Error(
				'the client read ctx.remote.skillsWatch — the mounted namespace is a separate '
				+ 'Cordis service and must be read with ctx.reflect.get("remote.skillsWatch")',
			);
		},
	},
	reflect: {
		get(key) { return key === "remote.skillsWatch" ? namespaceService : undefined; },
	},
	effect(cb, label) { effectRuns.push({ label, result: cb() }); },
};

let applyError = null;
try {
	mod.apply(ctx);
} catch (err) {
	applyError = err;
}
check(
	"apply() completes without throwing",
	applyError === null,
	applyError === null ? undefined : String(applyError && applyError.stack ? applyError.stack.split("\n").slice(0, 3).join("\n          ") : applyError),
);
if (applyError !== null) process.exit(1);

check("apply() registers both slot components", registered.length === 2, "registered " + registered.length);
check(
	"the badge registers into conversation.session.header.utilities",
	registered.some((r) => r.meta && r.meta.name === "conversation.session.header.utilities" && r.meta.id === "skills-watch-badge"),
);
check(
	"the panel registers into shell.overlay",
	registered.some((r) => r.meta && r.meta.name === "shell.overlay" && r.meta.id === "skills-watch-overlay"),
);
check("apply() schedules the mount effect", effectRuns.length === 1, "ran " + effectRuns.length + " effect(s)");

// Await the effect body: it mounts the descriptors and takes the first reading.
let effectError = null;
try {
	await Promise.all(effectRuns.map((e) => e.result));
} catch (err) {
	effectError = err;
}
check(
	"the mount effect resolves (remote mount + first poll)",
	effectError === null,
	effectError === null ? undefined : String(effectError && effectError.message),
);

check("the effect mounted the remote descriptors", mounted.length === 1, "mounted " + mounted.length + " time(s)");
check("the first poll reached skillsWatch.list", listCalls.length === 1, "list() called " + listCalls.length + " time(s)");

// ── 4. Exercise the codecs the Host actually receives ─────────────────────
const desc = mounted[0] && Array.isArray(mounted[0].descriptors) ? mounted[0].descriptors[0] : undefined;
check("the mounted payload carries one descriptor", desc !== undefined);

if (desc !== undefined) {
	check("mounted descriptors keep the package id", mounted[0].package === pkg.name, JSON.stringify(mounted[0].package));

	const reqCodec = desc.parameters && desc.parameters[0] && desc.parameters[0].codec;
	const resCodec = desc.result;

	check('the request codec declares mode "strict"', reqCodec && reqCodec.mode === "strict");
	check("the request codec exposes parse()", reqCodec && reqCodec.schema && typeof reqCodec.schema.parse === "function");
	check("the result codec exposes parse()", resCodec && resCodec.schema && typeof resCodec.schema.parse === "function");

	if (reqCodec && reqCodec.schema && typeof reqCodec.schema.parse === "function") {
		let parsed;
		let threw = false;
		try {
			parsed = reqCodec.schema.parse({ cwd: "/work" });
		} catch (err) {
			threw = true;
		}
		check("the request codec accepts and normalizes a cwd", !threw && parsed && parsed.cwd === "/work", threw ? "threw" : JSON.stringify(parsed));

		let emptyOk = true;
		try {
			const empty = reqCodec.schema.parse(undefined);
			emptyOk = empty !== null && typeof empty === "object" && empty.cwd === undefined;
		} catch {
			emptyOk = false;
		}
		check("the request codec tolerates an absent request", emptyOk);

		const rejection = throwsWith(() => reqCodec.schema.parse({ cwd: 5 }), "request.cwd");
		check("the request codec rejects a non-string cwd", rejection === true, rejection === true ? undefined : String(rejection));
	}

	if (resCodec && resCodec.schema && typeof resCodec.schema.parse === "function") {
		let normalized;
		let threw = false;
		try {
			normalized = resCodec.schema.parse(FIXTURE);
		} catch (err) {
			threw = true;
		}
		check("the result codec accepts a well-formed snapshot", !threw && normalized && normalized.skills.length === 4, threw ? "threw" : undefined);

		const rejection = throwsWith(() => resCodec.schema.parse({ skills: [], roots: [], summary: {}, polledAt: 1 }), "polledAt");
		check("the result codec rejects a malformed snapshot", rejection === true, rejection === true ? undefined : String(rejection));
	}
}

// ── 5. Really render both slot components ─────────────────────────────────
const badge = registered.find((r) => r.meta && r.meta.id === "skills-watch-badge");
const panel = registered.find((r) => r.meta && r.meta.id === "skills-watch-overlay");

check("the badge component is a function", badge && typeof badge.Component === "function");
check("the panel component is a function", panel && typeof panel.Component === "function");

if (badge && typeof badge.Component === "function") {
	let markup = null;
	let renderError = null;
	try {
		markup = renderToStaticMarkup(ReactShim.createElement(badge.Component, {}));
	} catch (err) {
		renderError = err;
	}
	check(
		"the badge renders without throwing",
		renderError === null,
		renderError === null ? undefined : String(renderError && renderError.message),
	);
	if (renderError === null) {
		check("the badge reports the one stale skill", markup.includes("1 behind"), "markup: " + String(markup).slice(0, 160));
		check("the badge opts back into pointer events", markup.includes("pointer-events:auto") || markup.includes("pointer-events: auto"), "markup: " + String(markup).slice(0, 200));
	}
	check("the badge exposes a click handler", clicks.length >= 1, "captured " + clicks.length);
}

// The stylesheet reaches the page through a <style> tag that only the browser
// injects, so its pointer-events opt-in can never appear in static markup —
// assert on the rule in the artifact instead.
check(
	"the panel stylesheet opts the overlay back into pointer events",
	/\.sw-panel\{[^}]*pointer-events:auto/.test(src),
);

if (panel && typeof panel.Component === "function") {
	// Initially closed: the overlay must contribute nothing.
	let closedMarkup = null;
	let closedError = null;
	try {
		closedMarkup = renderToStaticMarkup(ReactShim.createElement(panel.Component, {}));
	} catch (err) {
		closedError = err;
	}
	check("the closed panel renders off-screen without throwing", closedError === null, closedError === null ? undefined : String(closedError && closedError.message));
	check("the closed panel contributes no markup", closedMarkup === "" || closedMarkup === null, JSON.stringify(String(closedMarkup).slice(0, 80)));

	// Click the badge to open the store, exactly as a user would.
	if (clicks.length >= 1) {
		try {
			clicks[0].onClick();
		} catch (err) {
			check("the badge click opens the panel", false, String(err && err.message));
		}
		// toggle() fires refresh() without awaiting it; give it a turn.
		await new Promise((r) => setTimeout(r, 0));

		let openMarkup = null;
		let openError = null;
		try {
			openMarkup = renderToStaticMarkup(ReactShim.createElement(panel.Component, {}));
		} catch (err) {
			openError = err;
		}
		check(
			"the open panel renders without throwing",
			openError === null,
			openError === null ? undefined : String(openError && openError.message),
		);
		if (openError === null) {
			const m = String(openMarkup);
			check("the open panel lists the stale skill", m.includes("knap"), "markup: " + m.slice(0, 200));
			check("the open panel shows both SHAs for a stale skill", m.includes("62f144d") && m.includes("9ab34cd"), "markup: " + m.slice(0, 300));
			check("the open panel labels the unknown row honestly", m.includes("check failed"), "markup: " + m.slice(0, 400));

			// Roots holding no skills are folded away by default. The panel must
			// advertise them as a count rather than silently dropping them.
			check(
				"the open panel folds the empty root behind a count",
				m.includes("other") && !m.includes("~/.agents/skills"),
				"markup: " + m.slice(0, 500),
			);

			const idleToggle = clickTitled("click to expand");
			check(
				"the empty-root fold is clickable",
				idleToggle !== undefined,
				"titles seen: " + clicks.map((c) => c.props.title).filter((t) => typeof t === "string").slice(0, 8).join(" | "),
			);
			if (idleToggle !== undefined) {
				let expandError = null;
				try {
					idleToggle.onClick();
				} catch (err) {
					expandError = err;
				}
				check("expanding the empty root does not throw", expandError === null, expandError === null ? undefined : String(expandError && expandError.message));
				const expanded = String(renderToStaticMarkup(ReactShim.createElement(panel.Component, {})));
				check("the expanded panel names the empty root", expanded.includes("~/.agents/skills"), "markup: " + expanded.slice(0, 600));
				check("the expanded panel dims the empty root", expanded.includes("is-idle"), "markup: " + expanded.slice(0, 600));
			}
		}
	}
}

// ── 6. A failed $mount must be visible, not silent ────────────────────────
// Before v0.18.4 a $mount rejection escaped the effect into Cordis' logger only.
// The store stayed at its initial state, so the badge read "skills..." and the
// panel read "not checked yet" with no indication that anything was wrong —
// which is exactly how the namespace bug above stayed hidden. Build a second
// module instance whose $mount rejects and assert the failure reaches the UI.
{
	const failingRegistered = [];
	const failingEffects = [];
	const failingCtx = {
		slots: {
			inject(name, cb) { return cb(); },
			register(meta, Component) { failingRegistered.push({ meta, Component }); return function dispose() {}; },
		},
		remote: {
			async $mount() { throw new Error("no carrier for remote.skillsWatch"); },
		},
		reflect: { get() { return undefined; } },
		effect(cb, label) { failingEffects.push({ label, result: cb() }); },
	};

	const failingMod = spec.factory(requireFromTable);
	let failingApplyError = null;
	try {
		failingMod.apply(failingCtx);
	} catch (err) {
		failingApplyError = err;
	}
	check(
		"apply() survives a rejecting $mount",
		failingApplyError === null,
		failingApplyError === null ? undefined : String(failingApplyError && failingApplyError.message),
	);

	let failingEffectError = null;
	try {
		await Promise.all(failingEffects.map((e) => e.result));
	} catch (err) {
		failingEffectError = err;
	}
	check(
		"the mount effect absorbs the rejection instead of leaving it unhandled",
		failingEffectError === null,
		failingEffectError === null ? undefined : String(failingEffectError && failingEffectError.message),
	);

	const failingBadge = failingRegistered.find((r) => r.meta && r.meta.id === "skills-watch-badge");
	const failingPanel = failingRegistered.find((r) => r.meta && r.meta.id === "skills-watch-overlay");

	if (failingBadge && typeof failingBadge.Component === "function") {
		const markup = String(renderToStaticMarkup(ReactShim.createElement(failingBadge.Component, {})));
		check(
			"a failed mount shows up on the badge",
			markup.includes("skills error") && markup.includes("no carrier for remote.skillsWatch"),
			"markup: " + markup.slice(0, 220),
		);
	}

	if (failingPanel && typeof failingPanel.Component === "function") {
		// The panel only renders while open, so open it through its own store.
		const panelled = failingRegistered.find((r) => r.meta && r.meta.id === "skills-watch-badge");
		if (panelled && typeof panelled.Component === "function") {
			renderToStaticMarkup(ReactShim.createElement(panelled.Component, {}));
			const opener = clicks.slice(-1)[0];
			if (opener !== undefined && typeof opener.onClick === "function") opener.onClick();
		}
		const markup = String(renderToStaticMarkup(ReactShim.createElement(failingPanel.Component, {})));
		// Opening the panel re-runs refresh(), which replaces the mount error with
		// the "namespace is not mounted" diagnosis. Either message is a correct
		// explanation, so assert on the error line rather than one exact string.
		check(
			"a failed mount is explained in the panel",
			markup.includes("sw-err") && /not mounted yet|mount failed/.test(markup),
			"markup: " + markup.slice(0, 400),
		);
	}
}

// ── 7. A failing Result envelope must reach the UI as an error ────────────
// The carrier answers a failed call with `{ ok: false, error: { code, message } }`
// instead of rejecting. Handed on unwrapped, that envelope has no `skills` field,
// so the panel would draw an empty table and claim everything was fine.
{
	const envRegistered = [];
	const envEffects = [];
	const ENVELOPE_ERROR = "skills-watch: git ls-remote failed";
	const envCtx = {
		slots: {
			inject(name, cb) { return cb(); },
			register(meta, Component) { envRegistered.push({ meta, Component }); return function dispose() {}; },
		},
		remote: {
			async $mount() { return function dispose() {}; },
			get skillsWatch() { throw new Error("must not be read"); },
		},
		reflect: {
			get(key) {
				if (key !== "remote.skillsWatch") return undefined;
				return {
					async list() {
						return { ok: false, error: { code: "internal", message: ENVELOPE_ERROR, details: {} } };
					},
				};
			},
		},
		effect(cb, label) { envEffects.push({ label, result: cb() }); },
	};

	const envMod = spec.factory(requireFromTable);
	let envApplyError = null;
	try {
		envMod.apply(envCtx);
	} catch (err) {
		envApplyError = err;
	}
	check("apply() accepts a ctx whose replies will fail", envApplyError === null, envApplyError === null ? undefined : String(envApplyError && envApplyError.message));

	let envEffectError = null;
	try {
		await Promise.all(envEffects.map((e) => e.result));
	} catch (err) {
		envEffectError = err;
	}
	check(
		"a failed envelope does not reject the mount effect",
		envEffectError === null,
		envEffectError === null ? undefined : String(envEffectError && envEffectError.message),
	);

	const envBadge = envRegistered.find((r) => r.meta && r.meta.id === "skills-watch-badge");
	if (envBadge && typeof envBadge.Component === "function") {
		const markup = String(renderToStaticMarkup(ReactShim.createElement(envBadge.Component, {})));
		check(
			"a failed envelope is reported on the badge",
			markup.includes("skills error") && markup.includes("git ls-remote failed"),
			"markup: " + markup.slice(0, 260),
		);
		check(
			"a failed envelope is not mistaken for a clean empty result",
			!markup.includes("skills ok"),
			"markup: " + markup.slice(0, 260),
		);
	}
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log("");
if (fail === 0) {
	console.log("ALL PASS  (" + pass + " assertions)");
	process.exit(0);
}
console.log(fail + " FAILED of " + (pass + fail) + ":");
for (const f of failures) console.log("  - " + f);
process.exit(1);
