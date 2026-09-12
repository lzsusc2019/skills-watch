# Changelog

版本号对应动态 Cordis Package 的迭代。每个 Package ID（`pkg-N`）是一个不可变版本。

## [0.18.3] — 2026-09-12

修掉 `require("zod")` 之后暴露出来的第二个启动失败，并补上一个能真正跑起来客户端半边的测试。

### Fixed
- **`lib/client.js` factory 体内的暂时性死区（TDZ）。** 报错是
  `Cannot access 'requestSchema' before initialization`。`const TYPERT_REMOTE` 在 factory 体顶层**立即求值**，
  它的对象字面量里 `schema: requestSchema` / `schema: resultSchema` 读的是**声明在后面**的两个 `const`。
  加载器调用 factory 时整段执行，于是进 TDZ 抛错，整个 loader entry 失败（所以报的是
  `failed to import loader entry …`，脚本本身能正常求值）。
  修法是把 `schemaFail` / `isRecord` / `requestSchema` / `resultSchema` 整块**移到 `TYPERT_REMOTE` 之前**，
  只调整声明顺序，没有改任何行为。

### Added
- **`test/client-exec.mjs`（44 条断言）—— 真正执行客户端产物，而不是只校验形状。**
  v0.18.2 那个 TDZ 是 `test/wiring.mjs` 结构性检查永远抓不到的，所以这个测试补的是执行路径：
  1. 在只有 `window` 的裸上下文里求值 `lib/client.js`，让顶层崩溃按浏览器的样子暴露；
  2. 给 factory 一个**只提供平台模块表**（react / react-dom / react/jsx-runtime）的 `require`，其余一律抛加载器原话
     "missed the module table" —— 这正是 v0.18.1 那次 `require("zod")` 的守卫；
  3. 用 `slots` / `remote` / `effect` 桩调用 `apply()`，并 await 挂载 effect，跑通 `$mount` 与首次轮询；
  4. 用 Host 真正收到的 descriptor 调 codec 的 `parse()`，正例反例都验；
  5. 用 `react-dom/server` **真的渲染**两个 slot 组件，并模拟点击徽章把面板打开，再点开折叠的空根目录。
- `package.json` 增加 `scripts.test`，一次跑完三个测试
- 测试里断言了 `ctx.effect(async …)` 用法：查过 Cordis `_execute`（`@deepseek-ai/cordis/lib/index.js`），
  它显式处理 thenable 返回值（`else if ("then" in effect) return effect.then(safeCollect)`），
  所以 async 回调里 `await $mount` 再把 disposer 返回是官方支持写法

### Verified
- `test/smoke.js` 56 条、`test/wiring.mjs` 34 条、`test/client-exec.mjs` 44 条，全过
- **这个测试确实抓得住那个 bug，是实测的**：把修复前的 `lib/client.js` 换回去跑，
  它在「the factory runs under the real module table」这一条上以
  `Cannot access 'requestSchema' before initialization` 失败并退出 1；换回修复版即 ALL PASS。
  换句话说这条守卫不是事后编的

## [0.18.2] — 2026-09-12

修掉官方包形态第一次真跑时的启动失败。

### Fixed
- **`lib/client.js` 不再 `require("zod")`。** 客户端模块表里没有 zod 的 factory，注册时报
  `client-modules: require("zod") missed the module table — not a platform seed word, not a shell-own module, and no registered factory`。
  官方包是**构建时把 zod 内联进产物**，本包刻意没有构建步骤，所以改为手写客户端真正需要的那点表面：
  `parse` 校验顶层形状、归一化可选字段，逐行差异交给渲染层。
  依据是客户端侧的契约本身 —— `requireStrictCodec` 只读 `codec.mode`，`parse()` 只调
  `codec.schema.parse(value)`，从不触及校验器内部。`lib/typert.host.js` 保持真 zod，因为 host 加载器**确实**检查
  `_zod` 与 `parse`。

### Added
- `test/wiring.mjs` 新增客户端 require 守卫：只允许模块表确实提供的 id（依据是所有已发布客户端产物里出现过的
  require 清单），并断言不得 require 校验器库。这条本该在 v0.18.1 发布前就存在

## [0.18.1] — 2026-09-12

扫描目录不再照某一台机器写死，改为镜像 DSH 自己的解析逻辑。

### Fixed
- **默认根目录改为镜像 `@deepseek-ai/dsh-skill-filesystem` 的 `roots()`**：项目级 `<projectRoot>/.dsh/skills` 与 `.agents/skills`、用户级 `<DSH_HOME>/skills` 与 `<DSH_AGENTS_HOME>/skills`、打包级 `$DSH_BUNDLED_SKILL_DIR`。之前硬编码 `/Users/taozi/...`，别人装上结果必然不同
- **`~/.claude/skills` 移出默认列表** —— 那是 Claude Code 的目录，DSH 不从那里加载
- `<projectRoot>` 改用与 DSH 相同的算法（向上找 `.git`，落到根则返回原 cwd），不再拿 `process.cwd()` 直接当项目根

### Added
- **`list({ cwd })`**：Client 把当前会话的工作目录（`SessionSummary.cwd`，读自 slot prop `useSessions`）传给 Host，项目级 skill 因此跟随用户实际所在的工作区，而不是 DSH 进程启动目录。换工作区会重新解析，同工作区复用缓存
- 配置键 `extraRoots`（追加）、`dshHome` / `agentsHome` / `bundledSkillDir` / `customSkillDirs`；`roots` 仍是完全替换
- 结果新增 `projectRoot`，并在面板 `from` 行的悬停提示里显示 —— 项目级 skill 找不到时，这就是要看的那一项
- `lib/scan.js` 导出 `resolveRoots` / `findProjectRoot` / `expandHome` 供测试

### Verified
- `test/smoke.js` 56 条断言（原 33 条，新增根目录解析与逐次 cwd 覆盖）
- `test/wiring.mjs` 31 条断言（新增 `request` 参数 codec 与结果 schema 校验）
- 根目录解析在真实机器上核对过：`/Users/taozi/Documents/personal/.dsh/skills` 与 `/Users/taozi/.agents/skills` 在默认列表中，`~/.claude/skills` 被排除

## [0.18.0] — 2026-09-12

从「只能在 DSH 会话里 paste 源码运行的动态插件」变成**可安装的官方插件包**。

### Added
- `package.json`：官方包元数据 —— `exports`（`.` / `./typert` / `./remote` / `./client`）、`dsh.bundle.patch`、`dsh.client`（`platform` + 包名 `inject`）
- `cordis.patch.yml`：profile bundle 的行声明
- `lib/scan.js`：检测核心从 Host 半边抽出，改为注入 `fs` / `shell`，可脱离运行时测试
- `lib/index.js`：Host 半边改成 `TypertRemoteService` 子类，`list()` 经手动装饰器登记为 Remote
- `lib/typert.host.js` / `lib/typert.remote-client.js`：手写的 Typert 产物
- `lib/client.js`：浏览器半边改成 `window.__ModuleLoader__.load` 格式，数据源从 `host.call` 换成 `ctx.remote.skillsWatch.list()`
- `test/wiring.mjs`：用真实的 `validateTypertManifest` 与 `remoteMethods()` 校验接线
- README 大篇幅重写：官方通道、包结构、Typert 契约、装饰器免构建、客户端模块格式

### Changed
- 扫描目录默认值改为从 Host 进程推导（`process.env.HOME` / `process.cwd()`），不再硬编码 `/Users/taozi`
- `test/smoke.js` 改为直接 import `lib/scan.js`，不再用 `new Function` 包函数体

### Verified
- `test/smoke.js` 33 条断言通过（检测核心）
- `test/wiring.mjs` 19 条断言通过，其中 Host manifest 由部署里**真实的** `validateTypertManifest` 校验，Remote 标记由**真实的** `remoteMethods()` 读回 —— 证明手写 manifest 与免构建装饰器都成立

### Notes
- **客户端半边的真实渲染尚未在部署里验证。** 它由已验证的 `plugin/client.js` 改写而来（React store、pointer-events、渲染结构均未变），但官方包形态只做过离线校验
- 发布到 npm 前需要确认 `@lzsusc2019` scope 可用；若用别的名字，需同步改 `package.json` 的 `name`、`lib/typert.host.js` 的 `package` 与 `id`、`lib/client.js` 内联描述符里的同一批字符串、以及 `cordis.patch.yml` 的行 `name`

## [0.17] — 2026-09-12

最后一个版本。功能完成，代码归档。

### Added
- `+ N others` 从纯文本变成按钮：悬停列出每个未贡献 skill 的根目录（完整路径 + 原因），点击就地展开成淡色 chip
- 原因区分四种：`absent` / `unreadable` / `duplicate` / `no skills`
- `knap` 与 `humanizer` 加入 `.source.json` 测试数据，用于验证完整检测链路

## [0.16] — 2026-09-12

### Changed
- 来源行去噪：只显示真正贡献了 skill 的根目录，其余折叠成 `+ N empty`
- 路径压缩：`personal/.dsh/skills`、`~/.agents/skills`
- 计数只留数字

## [0.15] — 2026-09-12

### Added
- 胶囊下方新增来源行，逐个显示扫描过的根目录及其贡献数量，空目录淡化，悬停看绝对路径

## [0.14] — 2026-09-12

### Added
- Host 端新增 `summary` 字段：描述压缩后的作用句
- 压缩规则：触发词标记截断 → 取第一句 → 100 字封顶（英文退到词边界）

### Changed
- 面板描述改为单行省略号，完整原文移到悬停提示；行内边距 9px → 7px

## [0.13.1] — 2026-09-12

### Fixed
- `git` 调用一律设 `GIT_TERMINAL_PROMPT=0`。此前只在有 `GITHUB_TOKEN` 时才设，导致仓库名错误或私有仓库会卡在凭据提示直到超时

## [0.13] — 2026-09-12

实现原始需求定义。同时修掉三个叠加的真 bug。

### Added
- `.source.json` 托管 skill 识别（`{ repo, ref, local_sha, synced_at }`）
- `git ls-remote` 取远端对象 SHA 并与 `local_sha` 比对
- 四态：`up_to_date` / `behind` / `unknown` / `unmanaged`
- 远端 SHA 内存缓存 24h

### Fixed
- **`ShellExecRequest` 字段名错误**：此前传 `{ argv, cwd }`，而实际定义是 `{ command, workdir }` —— 两个字段都不存在，`resolve()` 生成空 spec，命令从未被执行。这是 v0.5/v0.6 用 bash 全部拿不到数据的真正原因
- **`ShellRunResult.stdout` 读取错误**：此前读 `res.stdout` 本身，实际是 `{ text, truncated, spillPath? }`，拿到的是 `"[object Object]"`
- **基于 mtime 的过期判定不可能工作**：`FsInfo` 是 `{ version, type, size }`，没有 mtime，`version` 也是不透明标识。该逻辑整体移除

## [0.12] — 2026-09-12

### Added
- 面板改用 `styles.insert()` 独立样式表，颜色全部走 `--dsw-alias-*` 主题 token，跟随 DSH 明暗主题
- 每个 skill 显示 description（两行截断，悬停看全文）
- 状态改用彩色圆点；版本号做成胶囊 chip

### Fixed
- frontmatter 解析支持 YAML 块标量（`description: |` 及其缩进正文）与嵌套 `metadata:` 块。此前 `description: |` 被读成字面量 `"|"`，`metadata.version` 完全取不到

## [0.11] — 2026-09-12

### Fixed
- `shell.overlay` 是点击穿透的，条目必须自己 opt-in pointer events。补上 `pointerEvents: 'auto'`，此前面板渲染出来但控件全是死的

## [0.10] — 2026-09-12

修掉真正卡住全流程的那个 bug。

### Fixed
- **改普通对象属性不会触发 React 重渲染**。此前徽章永远停在首帧（恒显示 `skills ok 0`），点击也不会有任何反应。改为共享 store + `React.useState` / `React.useEffect` 订阅

## [0.9] — 2026-09-12

### Changed
- `skills-poll` 数据源从 `ctx.skills.list()` 换成 `ctx.fs.listDir` + `ctx.fs.readText`（v0.8 已验证可用）
- 移除全部诊断 Tool

## [0.8.1] — 2026-09-12

### Changed
- `skills_fs_smoke` 返回完整的 `listdir_names`，此前只有数量

## [0.8] — 2026-09-12

第一次真正调用 Service。

### Added
- `skills_list_raw`：直接调 `ctx.skills.list()` 返回原始结果
- `skills_fs_smoke`：实测 `ctx.fs.resolve` / `listDir` / `readText`

### Findings
- `ctx.fs` 三件套全部可用，扫到 11 个 skill 目录，读到 `defuddle/SKILL.md`
- `ctx.skills.list()` 返回空数组

## [0.7.1] — 2026-09-12

### Fixed
- 恢复 v0.7 误删的 Client 半边（v0.7 只写了空的 `apply() {}`，徽章消失）

## [0.7] — 2026-09-12

转折点：第一次拿到 Service 的真实类型。

### Added
- `skills_diag` Tool，返回四个 Service 的 `typeof`

### Findings
- `ctx.shell` / `ctx.skills` / `ctx.timer` / `ctx.fs` **全部是 object**
- 此前 17 个版本基于「Service 不存在」的判断是错的

## [0.6] — 2026-09-12

### Changed
- 改用硬编码绝对路径 + `ls` 探测，绕开 `process.cwd()`

### Result
- 仍返回 0 —— 但真正原因是 shell 请求字段名错误（v0.13 修正）

## [0.5.1] — 2026-09-12

### Fixed
- RPC 返回值里的 `NaN` 导致 `cloneJson` 拒绝序列化。加 `sanitize()` 把非有限数转成 `null`

## [0.5] — 2026-09-12

### Added
- 改用 `shell.run('find …')` 替代 `ctx.fs`
- Client 加常驻 banner 用于确认渲染是否存活

## [0.4.1] — 2026-09-12

### Added
- 各扫描步骤加 `console.log` 诊断

## [0.4] — 2026-09-12

### Changed
- 放弃 `ctx.skills.list()`，改用 `ctx.fs.readDir` 直接扫描已知根目录

## [0.3.1] — 2026-09-12

### Fixed
- `skills_debug` 的 output schema 用了空 `{}`，schema 编译器拒绝。改成具体字段

## [0.3] — 2026-09-12

### Added
- `skills_debug` / `skills_stat` 诊断 Tool
- 基于 mtime 的过期判定（后被 v0.13 证明不可行）

## [0.2] — 2026-09-12

### Added
- 徽章点击切换浮层面板
- `skills-poll` RPC 返回完整 `skills[]` 行列表

## [0.1.6] — 2026-09-12

首个成功激活的版本。

### Fixed
- `defineTool` 入参缺顶层 `name`，注册表看到的是 `tool "undefined"`，撞上冲突直接拒绝

## [0.1.5] — 2026-09-12

### Fixed
- `output.schema` 里每个嵌套 object 必须显式声明 `additionalProperties: true|false`

## [0.1.4] — 2026-09-12

### Fixed
- `defineTool` 的 output 必须是 `{ schema, render, presentationMeta? }`，此前形态错误

## [0.1.3] — 2026-09-12

### Fixed
- `parameters` 顶层不能写 `additionalProperties: false`（参数根是开放的，只能省略或 `true`）

## [0.1.2] — 2026-09-12

### Added
- Host 注册 `skills-poll` RPC，供 Client 面板刷新使用

## [0.1.1] — 2026-09-12

### Fixed
- 动态 Tool 注册必须 `harness.defineTool` → `harness.registerTool` 两步
- `shell.run` 需要 `resolve(request)` 得到的 spec，不是原始 request

## [0.1] — 2026-09-12

初始版本。3 个 Tool（`skills_list` / `skills_check` / `skills_diff`）+ 徽章 + 浮层。

---

## 归档说明

仓库前身是一个独立 CLI 工具的构想（`bin/`、`src/`、`npm publish` 流程、配套 Agent Skill）。方向改成 DSH 插件后，那套脚手架整体删除，只保留最终跑通的 Host / Client 源码。

`pkg-3` 到 `pkg-31` 共 29 个 Package，其中 8 个因上表的接口误用而激活失败。这些失败记录留在 CHANGELOG 里，因为它们记录了 DSH 插件接口的真实边界。
