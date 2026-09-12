window.__ModuleLoader__.load({
	id: "@lzsusc2019/skills-watch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		// ── Stylesheet ───────────────────────────────────────────────────────
		// Static plugins insert their own <style> tag instead of using the
		// dynamic runner's `styles` builtin. Colors come from --dsw-alias-*
		// tokens so the panel follows the app theme.
		const css = [
			'.sw-panel{position:fixed;right:16px;bottom:16px;width:480px;max-height:72vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);font-size:13px;line-height:1.5;overflow:hidden;pointer-events:auto;z-index:9999}',
			'.sw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px 8px}',
			'.sw-title{font-weight:600;font-size:13px}',
			'.sw-sub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:8px}',
			'.sw-close{background:transparent;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:6px;font-family:inherit}',
			'.sw-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
			'.sw-stats{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 8px}',
			'.sw-pill{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
			'.sw-pill.is-ok{color:var(--dsw-alias-state-success-primary);border-color:currentColor}',
			'.sw-pill.is-behind{color:var(--dsw-alias-state-warn-primary);border-color:currentColor}',
			'.sw-src{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 6px;padding:0 14px 9px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
			'.sw-src-label{opacity:.7}',
			'.sw-root{display:inline-flex;align-items:baseline;gap:3px;white-space:nowrap}',
			'.sw-rootcode{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
			'.sw-rootn{opacity:.65;font-variant-numeric:tabular-nums}',
			'.sw-root.is-idle{opacity:.45}',
			'.sw-sep{opacity:.35}',
			'.sw-more{font-family:inherit;font-size:10.5px;opacity:.55;background:transparent;border:none;padding:0;cursor:pointer;color:inherit;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;white-space:nowrap}',
			'.sw-more:hover{opacity:.85}',
			'.sw-err{margin:0 14px 8px;padding:6px 8px;border-radius:6px;font-size:11px;color:var(--dsw-alias-state-error-primary);border:1px solid currentColor;word-break:break-word}',
			'.sw-note{margin:0 14px 8px;padding:6px 8px;border-radius:6px;font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);word-break:break-word}',
			'.sw-list{flex:1;overflow-y:auto;padding:0 8px 6px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.sw-item{display:grid;grid-template-columns:10px 1fr auto;gap:0 10px;padding:7px 8px;border-radius:8px}',
			'.sw-item:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.sw-dot{width:8px;height:8px;border-radius:50%;margin-top:6px;background:var(--dsw-alias-state-success-primary)}',
			'.sw-item.is-behind .sw-dot{background:var(--dsw-alias-state-warn-primary)}',
			'.sw-item.is-unknown .sw-dot,.sw-item.is-unmanaged .sw-dot{background:var(--dsw-alias-label-secondary);opacity:.4}',
			'.sw-name{font-weight:500;font-size:12.5px;display:flex;align-items:center;gap:6px;min-width:0}',
			'.sw-nametext{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.sw-ver{font-size:10px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex-shrink:0}',
			'.sw-state{font-size:11px;white-space:nowrap;margin-top:1px;color:var(--dsw-alias-label-secondary)}',
			'.sw-item.is-behind .sw-state{color:var(--dsw-alias-state-warn-primary)}',
			'.sw-item.is-ok .sw-state{color:var(--dsw-alias-state-success-primary)}',
			'.sw-sum{grid-column:2/4;font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.sw-shas{grid-column:2/4;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.sw-empty{padding:24px 14px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary)}',
			'.sw-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 14px 11px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}',
			'.sw-btn{font-family:inherit;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}',
			'.sw-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.sw-btn.is-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
			'.sw-btn.is-primary:hover{filter:brightness(1.08)}',
		].join('\n');

		const CSS_TAG_ID = "@lzsusc2019/skills-watch/skills-watch.css";
		function insertStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "@lzsusc2019/skills-watch";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		// ── Remote descriptors ──────────────────────────────────────────────
		// Inlined, exactly as the generator emits them into this artifact. The
		// canonical copy lives in lib/typert.remote-client.js; the client module
		// loader only serves the `./client` export, so it cannot be required.
		const TYPERT_REMOTE = {
			package: "@lzsusc2019/skills-watch",
			descriptors: [{
				id: "@lzsusc2019/skills-watch#skillsWatch/list",
				service: "skillsWatch",
				namespace: "skillsWatch",
				method: "list",
				invocation: { kind: "direct" },
				parameters: [{
					name: "request",
					wire: "request",
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: "@lzsusc2019/skills-watch/types#SkillsWatchListRequest",
						schema: requestSchema,
					},
				}],
				result: {
					mode: "strict",
					typeSymbol: "@lzsusc2019/skills-watch/types#SkillsWatchSnapshot",
					schema: resultSchema,
				},
				sourceLocation: { file: "lib/index.js", line: 84, column: 3 },
			}],
		};

		// ── Wire schemas ─────────────────────────────────────────────────────
		// The client codec contract is exactly `{ mode: 'strict', schema: { parse } }`:
		// the gateway's requireStrictCodec reads only `mode`, and its parse() only
		// calls `codec.schema.parse(value)`. It never reaches into a validator's
		// internals.
		//
		// Driving it with zod is not an option here. The client module table has no
		// zod factory — official packages inline their schemas at build time, and
		// this package deliberately has no build step — so `require("zod")` fails at
		// registration with "missed the module table". lib/typert.host.js keeps real
		// zod, because the host loader does check for it (`_zod` plus `parse`).
		//
		// So the small surface the client actually needs is hand-rolled: validate the
		// top-level shape, normalize the optional fields, and let the renderer handle
		// per-row variance.

		function schemaFail(what) {
			throw new Error("skills-watch: " + what);
		}
		function isRecord(v) {
			return typeof v === "object" && v !== null && !Array.isArray(v);
		}

		const requestSchema = {
			parse(value) {
				const v = (value === undefined || value === null) ? {} : value;
				if (!isRecord(v)) schemaFail("request must be an object");
				if (v.cwd !== undefined && v.cwd !== null && typeof v.cwd !== "string") {
					schemaFail("request.cwd must be a string when present");
				}
				return (typeof v.cwd === "string" && v.cwd.length > 0) ? { cwd: v.cwd } : {};
			},
		};

		const resultSchema = {
			parse(value) {
				if (!isRecord(value)) schemaFail("result must be an object");
				if (!Array.isArray(value.skills)) schemaFail("result.skills must be an array");
				if (!Array.isArray(value.roots)) schemaFail("result.roots must be an array");
				if (!isRecord(value.summary)) schemaFail("result.summary must be an object");
				if (typeof value.polledAt !== "string") schemaFail("result.polledAt must be a string");
				return {
					skills: value.skills,
					roots: value.roots,
					projectRoot: typeof value.projectRoot === "string" ? value.projectRoot : null,
					summary: value.summary,
					note: typeof value.note === "string" ? value.note : null,
					polledAt: value.polledAt,
				};
			},
		};

		/**
		 * Required Client services. `remote` carries the gateway that mounts the
		 * descriptors below; `slots` is the registration surface.
		 */
		const inject = ["slots", "remote"];

		const STATE_LABEL = {
			behind: "behind upstream",
			up_to_date: "up to date",
			unknown: "check failed",
			unmanaged: "unmanaged",
		};

		function apply(ctx) {
			insertStyles();

			// ── Shared store ─────────────────────────────────────────────────
			// Mutating a plain object does not re-render. Both slot occupants
			// subscribe through React.useState, and publish() is what repaints
			// them once a poll resolves.
			const listeners = new Set();
			let snapshot = {
				open: false,
				showIdle: false,
				rows: [],
				roots: [],
				projectRoot: null,
				cwd: null,
				summary: { total: 0, managed: 0, unmanaged: 0, upToDate: 0, behind: 0, unknown: 0 },
				note: null,
				polledAt: null,
				error: null,
				loading: true,
			};

			function publish(next) {
				snapshot = next;
				for (const l of Array.from(listeners)) {
					try { l(snapshot); } catch (e) { console.error("[skills-watch] listener threw", e); }
				}
			}
			function subscribe(l) { listeners.add(l); return function () { listeners.delete(l); }; }
			function current() { return snapshot; }

			function namespace() {
				return ctx.remote ? ctx.remote.skillsWatch : undefined;
			}

			async function refresh(cwdOverride) {
				const ns = namespace();
				if (ns === undefined) {
					publish(Object.assign({}, current(), {
						error: "remote.skillsWatch is not mounted yet",
						loading: false,
					}));
					return;
				}
				const cwd = (typeof cwdOverride === "string" && cwdOverride.length > 0)
					? cwdOverride
					: current().cwd;
				publish(Object.assign({}, current(), { loading: true, cwd: cwd || null }));
				try {
					// Passing the session cwd lets the Host discover project roots
					// the same way the Harness does, instead of guessing from the
					// Host process's own working directory.
					const res = await ns.list(cwd ? { cwd: cwd } : {});
					publish(Object.assign({}, current(), {
						rows: Array.isArray(res && res.skills) ? res.skills : [],
						roots: Array.isArray(res && res.roots) ? res.roots : [],
						projectRoot: res && typeof res.projectRoot === "string" ? res.projectRoot : null,
						summary: res && res.summary ? res.summary : current().summary,
						note: res && res.note ? String(res.note) : null,
						polledAt: res && res.polledAt ? res.polledAt : new Date().toISOString(),
						error: null,
						loading: false,
					}));
				} catch (err) {
					publish(Object.assign({}, current(), {
						error: err && err.message ? String(err.message) : String(err),
						loading: false,
					}));
				}
			}

			function toggle() {
				publish(Object.assign({}, current(), { open: !current().open }));
				refresh();
			}
			function toggleIdle() {
				publish(Object.assign({}, current(), { showIdle: !current().showIdle }));
			}
			function close() {
				publish(Object.assign({}, current(), { open: false }));
			}

			// Mount the descriptors, then take the first reading. The effect
			// disposer unmounts the remote when the plugin stops.
			ctx.effect(async () => {
				const dispose = await ctx.remote.$mount(TYPERT_REMOTE);
				await refresh();
				return dispose;
			}, "skills-watch: mount remote + first poll");

			/**
			 * Feeds the calling session's working directory to refresh().
			 *
			 * `useSessions` is a SnapshotSelectorHook passed as a slot prop, so it
			 * can only be called from a component. This bridge is only rendered
			 * when the prop is present, which keeps the hook call unconditional
			 * inside it.
			 */
			function CwdBridge(props) {
				const useSessions = props.useSessions;
				const cwd = useSessions(function (state) {
					const id = state ? state.current : undefined;
					const row = (id && state && state.byId) ? state.byId[id] : undefined;
					return row ? row.cwd : undefined;
				});
				React.useEffect(function () {
					if (typeof cwd === "string" && cwd.length > 0) refresh(cwd);
				}, [cwd]);
				return null;
			}

			function useSnapshot() {
				const pair = React.useState(current());
				const setSnap = pair[1];
				const snap = pair[0];
				React.useEffect(function () {
					setSnap(current());
					return subscribe(function (next) { setSnap(next); });
				}, []);
				return snap;
			}

			function badgeText(s) {
				if (s.error) return "skills error";
				if (s.loading && !s.polledAt) return "skills...";
				const behind = (s.summary && s.summary.behind) || 0;
				if (behind > 0) return behind + " behind";
				const managed = (s.summary && s.summary.managed) || 0;
				if (managed === 0) return "skills ok (" + ((s.summary && s.summary.total) || 0) + ")";
				return "skills ok (" + managed + " checked)";
			}

			function idleReason(r) {
				if (r.status === "absent") return "absent";
				if (r.status === "unreadable") return "unreadable";
				if ((r.found || 0) > 0) return "duplicate";
				return "no skills";
			}

			// ── Header badge ───────────────────────────────────────────────
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "skills-watch-badge",
				order: 30,
				label: "skills-watch",
			}, function SkillsWatchBadge(props) {
				const s = useSnapshot();
				const behind = (s.summary && s.summary.behind) || 0;
				const isError = !!s.error;
				const bridge = (props && typeof props.useSessions === "function")
					? React.createElement(CwdBridge, props)
					: null;
				const button = React.createElement("button", {
					onClick: toggle,
					title: s.error
						? "poll failed: " + s.error
						: "last check " + (s.polledAt || "never") + " — click to " + (s.open ? "close" : "open"),
					style: {
						padding: "2px 8px",
						borderRadius: 6,
						border: "1px solid " + (isError ? "#dc2626" : behind > 0 ? "#d97706" : "#16a34a"),
						background: isError ? "#fee2e2" : behind > 0 ? "#fef3c7" : "#dcfce7",
						color: isError ? "#991b1b" : behind > 0 ? "#92400e" : "#166534",
						fontSize: 12,
						cursor: "pointer",
						fontFamily: "inherit",
						display: "inline-flex",
						alignItems: "center",
						gap: 4,
						pointerEvents: "auto",
					},
				}, badgeText(s), React.createElement("span", { style: { fontSize: 10, opacity: 0.75 } }, s.open ? "▲" : "▼"));
				return bridge === null ? button : React.createElement(React.Fragment, null, bridge, button);
			}));

			// ── Floating panel ────────────────────────────────────────────
			// shell.overlay is click-through by design, so the panel root opts
			// back into pointer events.
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "skills-watch-overlay",
				order: 50,
				label: "skills-watch panel",
			}, function SkillsWatchPanel() {
				const s = useSnapshot();
				if (!s.open) return null;

				const rows = s.rows || [];
				const roots = s.roots || [];
				const sum = s.summary || {};

				const head = React.createElement("div", { className: "sw-head" },
					React.createElement("div", null,
						React.createElement("span", { className: "sw-title" }, "skills-watch"),
						React.createElement("span", { className: "sw-sub" },
							s.polledAt ? "checked " + new Date(s.polledAt).toLocaleTimeString() : "not checked yet")),
					React.createElement("button", { className: "sw-close", title: "Close", onClick: close }, "×"));

				const pills = [
					React.createElement("span", { key: "a", className: "sw-pill" }, (sum.total || 0) + " skills"),
					React.createElement("span", { key: "b", className: "sw-pill" }, (sum.managed || 0) + " managed"),
					React.createElement("span", { key: "c", className: "sw-pill" }, (sum.unmanaged || 0) + " unmanaged"),
				];
				if ((sum.behind || 0) > 0) pills.push(React.createElement("span", { key: "d", className: "sw-pill is-behind" }, (sum.behind || 0) + " behind"));
				if ((sum.upToDate || 0) > 0) pills.push(React.createElement("span", { key: "e", className: "sw-pill is-ok" }, (sum.upToDate || 0) + " up to date"));
				if ((sum.unknown || 0) > 0) pills.push(React.createElement("span", { key: "f", className: "sw-pill" }, (sum.unknown || 0) + " unchecked"));

				const active = roots.filter(function (r) { return (r.counted || 0) > 0; });
				const idle = roots.filter(function (r) { return !(r.counted || 0); });
				// The resolved project root is the key fact when a project-local skill
				// is missing: it is where `.dsh/skills` was looked for.
				const srcChips = [React.createElement("span", {
					key: "lbl",
					className: "sw-src-label",
					title: s.projectRoot ? "project root: " + s.projectRoot : "",
				}, "from")];

				if (active.length === 0 && idle.length === 0) {
					srcChips.push(React.createElement("span", { key: "none" }, "—"));
				} else {
					active.forEach(function (r, idx) {
						if (idx > 0) srcChips.push(React.createElement("span", { key: "s" + idx, className: "sw-sep" }, "·"));
						srcChips.push(React.createElement("span", {
							key: "a" + idx,
							className: "sw-root",
							title: r.root + "  —  " + (r.counted || 0) + " skills",
						},
							React.createElement("span", { className: "sw-rootcode" }, r.short || r.display || r.root),
							React.createElement("span", { className: "sw-rootn" }, String(r.counted || 0))));
					});
					if (idle.length > 0) {
						const idleTip = idle.map(function (r) { return r.root + "  —  " + idleReason(r); }).join("\n");
						srcChips.push(React.createElement("button", {
							key: "more",
							className: "sw-more",
							title: idleTip + "\n\nclick to " + (s.showIdle ? "collapse" : "expand"),
							onClick: toggleIdle,
						}, (s.showIdle ? "− " : "+ ") + idle.length + " other" + (idle.length === 1 ? "" : "s")));
					}
					if (s.showIdle && idle.length > 0) {
						idle.forEach(function (r, idx) {
							srcChips.push(React.createElement("span", {
								key: "i" + idx,
								className: "sw-root is-idle",
								title: r.root + "  —  " + idleReason(r),
							},
								React.createElement("span", { className: "sw-rootcode" }, r.short || r.display || r.root),
								React.createElement("span", { className: "sw-rootn" }, idleReason(r))));
						});
					}
				}
				const srcLine = React.createElement("div", { className: "sw-src" }, srcChips);
				const errLine = s.error ? React.createElement("div", { className: "sw-err" }, s.error) : null;
				const noteLine = s.note ? React.createElement("div", { className: "sw-note" }, s.note) : null;

				const list = rows.length === 0
					? React.createElement("div", { className: "sw-empty" },
						s.loading ? "scanning…" : s.error ? "scan failed" : "no skills found")
					: rows.map(function (r) {
						const mods = r.status === "behind" ? " is-behind"
							: r.status === "up_to_date" ? " is-ok"
							: r.status === "unknown" ? " is-unknown" : " is-unmanaged";
						const kids = [
							React.createElement("div", { key: "dot", className: "sw-dot" }),
							React.createElement("div", { key: "name", className: "sw-name" },
								React.createElement("span", { className: "sw-nametext", title: r.dir || r.name }, r.name),
								r.version ? React.createElement("span", { className: "sw-ver" }, "v" + r.version) : null),
							React.createElement("div", { key: "st", className: "sw-state", title: r.detail || "" },
								STATE_LABEL[r.status] || r.status),
						];
						const line = r.summary || r.description;
						if (line) {
							kids.push(React.createElement("div", {
								key: "sum",
								className: "sw-sum",
								title: r.description || line,
							}, line));
						}
						if (r.status === "behind") {
							kids.push(React.createElement("div", { key: "sh", className: "sw-shas", title: r.repo },
								"local " + (r.localSha || "?").slice(0, 7) + " → remote " + (r.remoteSha || "?").slice(0, 7)));
						} else if (r.status === "up_to_date") {
							kids.push(React.createElement("div", { key: "sh", className: "sw-shas", title: r.repo },
								(r.localSha || "?").slice(0, 7) + " · " + r.repo));
						} else if (r.status === "unknown" && r.detail) {
							kids.push(React.createElement("div", { key: "sh", className: "sw-shas", title: r.detail }, r.detail));
						}
						return React.createElement("div", { key: r.path || r.name, className: "sw-item" + mods }, kids);
					});

				const foot = React.createElement("div", { className: "sw-foot" },
					React.createElement("span", null, rows.length + " shown"),
					React.createElement("div", { style: { display: "flex", gap: 6 } },
						React.createElement("button", { className: "sw-btn is-primary", onClick: refresh }, "Check now"),
						React.createElement("button", { className: "sw-btn", onClick: close }, "Close")));

				return React.createElement("div", { className: "sw-panel", "data-skills-watch": "panel" },
					head,
					React.createElement("div", { className: "sw-stats" }, pills),
					srcLine,
					errLine,
					noteLine,
					React.createElement("div", { className: "sw-list" }, list),
					foot);
			}));
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
