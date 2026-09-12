# Changelog

版本号对应动态 Cordis Package 的迭代。每个 Package ID（`pkg-N`）是一个不可变版本。

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
