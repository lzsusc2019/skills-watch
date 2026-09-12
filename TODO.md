# 待办与路线图

从实机取证得到的设计缺口，按已核实的证据记录，便于后续直接动手。

---

## 1. 接入 `~/.agents/.skill-lock.json` 作为第二个来源

`skills` CLI（vercel-labs/skills）把每个已装 skill 的来源写进
`~/.agents/.skill-lock.json`（version 3），字段含 `source` / `sourceType` /
`sourceUrl` / `skillPath` / `skillFolderHash` / `installedAt`。

当前插件只读 `.source.json`（自己定的约定，生态里无人写），于是把这类 skill
归为 `unmanaged` —— 这不准确，因为上游是已知的。

### 已核实的实机数据（2026-09-12）

| skill | sourceUrl | 安装时间 | lockfile folder hash vs 本地重算 |
|---|---|---|---|
| find-skills | `github.com/vercel-labs/skills.git` (`skills/find-skills/SKILL.md`) | 2026-06-03 | 一致 → 本地未改，但与当前上游差 5 行 → 真 behind |
| voice-debrief | `github.com/realwooolf/voice-debrief.git` (`SKILL.md`) | 2026-06-03 | **不一致** → 本地与记录不符 |

`skillFolderHash` 是**已安装文件夹的 git tree 对象哈希**，已精确复现
（`3013fdeb…` = 对 `find-skills` 文件夹用 git tree 算法重算的结果）。

### 为什么值得做

- 它给的是**内容派生**哈希，能检出本地手改 —— 当前 `local_sha` 是声明，做不到。
- 它覆盖的是生态实际安装的 skill，不依赖一个没人会写的约定文件。
- 对比应走**方案 B（内容树哈希）**而非方案 A（commit-SHA），见下条。

---

## 2. 多 skill 仓库里只装其中一个时，对比要落到 skill 自己的子路径

一个仓库装多个 skill、本机只装其中一个，是常见情况。这种情况下**不能拿整个仓库
的 HEAD commit 去比**：仓库改了别的 skill，会让文件没动的 skill 全部误报 `behind`。

### 已核实的实机数据（2026-09-12）

`kepano/obsidian-skills` 一个仓库装 6 个 skill：defuddle、json-canvas、knap、
obsidian-bases、obsidian-cli、obsidian-markdown。本机这 6 个全装了，且都与该仓库
HEAD 逐字节一致（同源）。

最近的 commit 只动子集：

| commit | 动了 |
|---|---|
| `9b736ba` | 只 obsidian-bases |
| `1e1df34` | 只 defuddle |
| `5a557ce` | json-canvas + obsidian-bases + obsidian-cli + obsidian-markdown（4 个） |

### 方案 A 在它上面的误报

若用 commit-SHA 相等（当前方案），`9b736ba` 这种只改 obsidian-bases 的 commit，
会让 knap / json-canvas / obsidian-cli / obsidian-markdown 这 4 个**文件根本没动**
的 skill 全部变成 `behind`。

### 正确做法

对比**只落在该 skill 的子路径内容**上：

```
git tree hash(本地 skill 文件夹)  vs  git tree hash(上游 <skillPath 所在目录>@HEAD)
```

即方案 B。它同时解决"本地手改检测"和"多 skill 仓库子集误报"两个问题。

---

## 方案对照（便于后续选型）

| 方案 | 比什么 | 发现本地手改 | 粒度 | 来源依赖 |
|---|---|---|---|---|
| A. 当前 | `local_sha` 声明 == `git ls-remote` 对象 SHA | 否 | 整个仓库 commit | `.source.json`（自定） |
| B. 内容树哈希 | `tree hash(本地文件夹)` == `tree hash(上游子路径@HEAD)` | 是 | 单个 skill 文件集 | `.skill-lock.json` 的 `skillPath`，或 `.source.json` 加一个 `skillPath` 字段 |
