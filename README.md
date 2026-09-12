# skills-watch

DSH 插件。盯住本机安装的 Agent Skill，判断**哪些落后于它的上游仓库**，并在界面里直接展示。

- **状态徽章**在会话标题栏右侧（`conversation.session.header.utilities`）
- **点击徽章**在右下角展开面板（`shell.overlay`），列出每个 skill 的作用、版本、来源与检测状态
- 面板配色走 DSH 主题 token，跟随明暗主题

```
┌──────────────────────────────────────────────────────┐
│ skills-watch                      checked 21:51:07 × │
│ 14 skills · 2 managed · 12 unmanaged · 1 behind · 1 up to date │
│ from  personal/.dsh/skills 11 · ~/.agents/skills 3 · + 3 others │
├──────────────────────────────────────────────────────┤
│ ⬆️  knap                       behind upstream        │
│    Clean markdown render from templates…              │
│    local 62f144d → remote 8ccef29                     │
│ ✅  humanizer         v3.0.0   up to date             │
│    Rewrite AI-sounding text so it reads like the writer… │
│    9862685 · blader/humanizer                         │
│ ❓  adversarial-review v1.1.1  unmanaged              │
│    以攻击者视角审查 AI 交付的方案/设计/代码（AI 审 AI）    │
├──────────────────────────────────────────────────────┤
│ 14 shown                        [Check now] [Close]  │
└──────────────────────────────────────────────────────┘
```

---

## 检测模型

### 托管 skill 与 `.source.json`

一个 skill 只有**在 `SKILL.md` 同目录存在 `.source.json`** 时才算「托管」，才会进入过期检测：

```json
{
  "repo": "blader/humanizer",
  "ref": "HEAD",
  "local_sha": "9862685f575c65a8247f90369951df1b3416e3d6",
  "synced_at": "2026-09-12T00:00:00Z"
}
```

| 字段 | 说明 |
|---|---|
| `repo` | `owner/name` 或完整 URL（`https://`、`git@`、`ssh://` 均接受） |
| `ref` | 分支/tag/`HEAD`。缺省 `HEAD`，指向远端默认分支 —— 不用 `main`，避免命名差异 |
| `local_sha` | 本机当前所处的 commit |
| `synced_at` | 上次同步时间（目前仅记录，未参与判断） |

没有这个文件的 skill 一律是 `unmanaged`，**不参与过期检测**，也不会被误报。

### 过期判定

```
local_sha  ≠  git ls-remote <repo> <ref>  返回的对象 SHA
```

用的是 `git ls-remote` 拿到的 **commit 对象 SHA**，不是 ref 字符串，所以 tag 重命名、分支改名都不会造成误判。默认 ref 走 `HEAD`。

### 四种状态

| 状态 | 含义 | 显示 |
|---|---|---|
| `up_to_date` | 托管，且本地 SHA 与远端一致 | 绿点 · up to date |
| `behind` | 托管，且本地 SHA 已落后 | 黄点 · behind upstream，附 `local xxx → remote yyy` |
| `unknown` | 托管，但远端检查失败（离线、仓库名错、私有仓库无凭据） | 灰点 · check failed，附失败原因 |
| `unmanaged` | 没有 `.source.json` | 灰点 · unmanaged |

`unknown` **不会被当成过期**。离线或 GitHub 不可达时显示灰色，不弹提示 —— 这是刻意的，避免误报。

### 触发时机

| 时机 | 行为 |
|---|---|
| 客户端挂载 | 自动跑一次 |
| 点击徽章 | 展开面板并重新检测 |
| 面板内 `Check now` | 重新检测 |

**没有后台定时器。** 不轮询，不做无谓请求。远端 SHA 在内存里缓存 24 小时，同一仓库同一次会话内不重复请求。

---

## 安装

本项目产出的是**动态 Cordis Package 的源码**，通过 `cordis_define` 加载。

1. 打开 `plugin/host.js`，把 `Configuration` 段的 `HOME` / `PROJECT` 改成你机器上的路径
2. 调用 `cordis_define`：
   - `plugin.kind` = `"new"`，`idPrefix` 用 3–6 个小写字母（如 `skwa`）
   - `name` / `purpose` 随意填
   - `code.host` = `plugin/host.js` 的**全部内容**
   - `code.client` = `plugin/client.js` 的**全部内容**
3. 用返回的 `pluginId` / `packageId` 调 `cordis_run`，`mode: "run"`
4. 刷新 DSH 页面

`code.host` / `code.client` 是**函数体**，不是模块：不要加 `import` / `require` / TypeScript 语法，文件末尾的 `return { ... }` 必须保留。

### 做成常驻插件

动态 Package 随进程重启消失。要常驻，需要把这两段代码打成可安装的 npm 包，然后在 agent preset 的 `agent.cordis.yml` 里加一行：

```yaml
- id: skills-watch
  name: '@your-scope/skills-watch'
```

这一行**不需要 `isolate` realm** —— 本插件只消费宿主的 `fs` / `shell` / 客户端的 `slots` / `styles`，**不发布任何 service**。（发布 service 的行才必须放进 realm，否则第二个会话挂载时会撞车。）

这一步尚未验证，因为它需要先完成打包。

---

## 配置

`plugin/host.js` 顶部：

```js
const HOME = '/Users/taozi';                      // 用户主目录
const PROJECT = HOME + '/Documents/personal';     // 会话工作区根目录（含 .dsh/skills 的那层）

const ROOTS = [
  PROJECT + '/.dsh/skills',
  PROJECT + '/.agents/skills',
  HOME + '/.dsh/skills',
  HOME + '/.agents/skills',
  HOME + '/.claude/skills',
];
```

| 常量 | 作用 |
|---|---|
| `ROOTS` | 扫描目录，**按顺序**；同名 skill 由**靠前的根目录**胜出（去重） |
| `CACHE_TTL_MS` | 远端 SHA 缓存时长，默认 24h |
| `MAX_SUMMARY` | 面板上描述压缩后的上限，默认 100 字 |

环境变量：`GITHUB_TOKEN` 目前**未使用**。私有仓库需要凭据时 `git ls-remote` 会失败并落到 `unknown`。

---

## 明确不做

- **不自动更新**任何 skill。插件只读，写操作需要单独的权限模型。
- **不展示 diff**。只标状态，不展开变更内容。
- **不支持 GitHub 以外的 Git 源**（`git ls-remote` 本身通用，但仓库地址归一化只覆盖 GitHub 简写）。
- **不处理本地手改过的 skill**。本地改动会让 `local_sha` 与远端不一致，此时会显示 `behind` —— 这是已知的语义边界。

---

## 面板行为细节

**描述压缩**：SKILL.md 的 `description` 通常是一句作用说明 + 一大段触发词列表。面板只显示作用句，规则是：

1. 遇到触发词标记就截断（`Use when` / `当用户说` / `触发场景` / `Triggers on` / `注意：` …）
2. 取第一句（中文断 `。！？；`，英文断 `. ! ? ;`）
3. 封顶 `MAX_SUMMARY` 字符，英文退到词边界
4. 完整原文保留在悬停提示里

**来源行**：只显示真正贡献了 skill 的根目录，其余折叠成 `+ N others` 按钮。悬停列出完整路径与原因，点击就地展开。原因分四种：

| 原因 | 含义 |
|---|---|
| `absent` | 目录不存在 |
| `unreadable` | 目录存在但读不了 |
| `duplicate` | 目录里的 skill 已被靠前的根目录加载过 |
| `no skills` | 目录存在但没有 SKILL.md |

---

## 已知的 DSH 接口事实

这一节是实打实踩出来的，再写同样的代码可以直接照抄。

### Service 注入

`inject: ['fs', 'shell']` 的四个 Service 都是真实对象（用 `typeof` 逐个确认过）：

```
ctx.skills → object   ctx.fs    → object
ctx.shell  → object   ctx.timer → object
```

`runtime.host.provides: []` 只表示**本插件没有向外部发布 service**，**不代表没拿到 service**。这两件事容易看混。

### `ctx.fs` —— 没有 mtime

```ts
// @deepseek-ai/dsh-fs
export interface FsInfo {
  version: FsVersion;                        // 不透明的新鲜度标识，不是时间戳
  type: 'file' | 'directory' | 'other';
  size?: number;
}
```

`stat` **不返回 mtime**，`version` 也无法折算成时间。任何「文件多少天没改」的判定在这条路径上都做不了。

可用的是：`resolve(path)` → `FsTarget`，`listDir(target)` → `FsDirEntry[]`（每项含 `name` / `type` / `target`），`readText(target)` → `string`。

### `ctx.shell` —— 请求与结果的确切形状

```ts
// @deepseek-ai/dsh-shell
export interface ShellExecRequest {
  command: string;          // 整条命令，不是 argv
  workdir?: string;         // 不是 cwd
  timeoutMs?: number;
  stdoutMaxBytes?: number;
  signal?: AbortSignal;
  stdin?: string;
  env?: Record<string, string>;
}

export interface ShellRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  timeoutMs: number;
  stdout: CollectedOutput;  // { text, truncated, spillPath? }
  stderr: CollectedOutput;
  sandbox?: ShellSandboxInfo;
}
```

调用方式是 `shell.resolve(request)` 拿 spec，再 `shell.run(spec)`。

`git` 一律带 `GIT_TERMINAL_PROMPT=0`：否则遇到不存在或私有的仓库，git 会尝试交互式索要凭据，一直卡到超时。

### `git ls-remote` 输出

实测三种情况：

| 场景 | 输出 | 退出码 |
|---|---|---|
| 正常 | `7e21f0fa…\tHEAD` | 0 |
| 空仓库 | 空 | 0 |
| 不存在 | `fatal: could not read Username for 'https://github.com': …` | 128 |

解析方式：取 stdout 第一行、第一段，校验 `^[0-9a-f]{7,40}$`。

### Cordis 动态 Tool 的三条硬规则

1. 必须 `harness.defineTool(def)` → `harness.registerTool(ctx, tool)` 两步，直接把普通对象交给 `registerTool` 会抛错
2. `defineTool` 的入参必须有顶层 `name`，否则注册表看到的是 `tool "undefined"`
3. `parameters` 顶层**不能**写 `additionalProperties`（只能省略或 `true`，因为参数根是开放的）；而 `output.schema` 里**每个嵌套 object 必须显式写** `additionalProperties: true|false` —— 两边规则相反

### RPC 返回值必须是 lossless JSON

`harness.handle` 的返回值不能含 `NaN` / `Infinity` / class 实例 / `Map` / `Set` / `Date` / `function`。`Number(undefined)` 得到 `NaN` 是最常见的踩坑点 —— 解析失败的分支要先判断再赋值。

### 客户端重渲染

**改普通对象的属性不会触发 React 重渲染。** 徽章会永远停在首帧、点击也没有任何反应。必须走 `React.useState` + `React.useEffect` 订阅一个外部 store，`publish()` 里通知订阅者。

### `shell.overlay` 是点击穿透的

槽位自身的文档写得很直接：

> The layer itself is click-through — entries opt back into pointer events — so an occupant never blocks the app underneath.

所以面板根节点必须显式写 `pointerEvents: 'auto'`，否则渲染出来了但按钮全是死的。另外槽位注册的 `id` 必须是新值，复用已发布的 id 会顶掉那一格。

### `ctx.skills` 不适合做「列出所有 skill」

在本部署下 `ctx.skills.list()` 返回空数组 —— 文件系统里明明有一批 skill。直接扫 `ctx.fs` 才是可靠路径。`ctx.skills` 与模型看到的 `<available_skills>` 目录也不是同一份数据：前者是 provider 注册的候选，后者含 system prompt 注入的部分。

---

## 测试

```bash
node test/smoke.js
```

零依赖。Host 半边只跟 `ctx.fs`、`ctx.shell` 和 `harness` 内置符号打交道，所以一组 stub 就够覆盖全部分支：SHA 比对、四种状态、YAML 解析（块标量 + 嵌套）、描述压缩（中英文）、排序、以及几条接口契约（`GIT_TERMINAL_PROMPT`、`command`/`workdir` 而非 `argv`/`cwd`、返回值可 JSON 序列化）。

stub 自己掌管文件系统，不碰真实机器。**测试里的根目录常量必须与 `plugin/host.js` 的 `Configuration` 段一致** —— 不一致的话 Host 扫不到 fixture，计数全为零，测试会明显失败。

Client 半边依赖 React 与 Slot 运行时，不在这个测试的覆盖范围内。

## 目录

```
plugin/
  host.js       Host 半边：扫描 + git ls-remote + skills-poll RPC
  client.js     Client 半边：徽章 + 面板
test/
  smoke.js      Host 半边的冒烟测试（零依赖）
```

## License

MIT — 见 [LICENSE](LICENSE)。
