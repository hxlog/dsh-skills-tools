# dsh-skills-tools v1.3 设计与开发迭代方案

状态：已实现（v1.3.0；「清空日志」按你的决定不做，其余按本方案落地）  
基线：仓库 v1.2.0（commit 03360b4，含稀疏克隆），npm 线上 1.1.1  
目标版本：**1.3.0**  
涉及文件：lib/*.js、client/client.src.js、client/ui.css、client/client.js（构建产物）、scripts/*、docs/*

---

## 0. 结论摘要

三个需求分别落在三个改动面，互不冲突：

| 需求 | 落点 | 关键决策（已由你选择） |
| --- | --- | --- |
| 1. 全部折叠 / 全部拉开 | 仅客户端 + 本机存储 | **只做全局一层**（仓库分组），**默认全部折叠**，状态存 localStorage |
| 2. 上游更新检查与提示 | 客户端调度 + Host 检查逻辑增强 | 打开面板自动查一次；可见时每 30 分钟复查；**顶部横幅 + 仓库角标**；支持**逐个更新 + 全部更新** |
| 3. 最近操作改为弹窗 | 客户端组件 + Host 日志 API | 保留工具栏入口；**紧凑列表弹窗**；支持刷新 / 复制 / 清空 |

不改 state.json 结构（latestCommit / checkedAt 已存在），不引入依赖，不改变 snapshots 与 provider 语义。

---

## 1. 现状（基于当前代码）

- 入口：client/client.src.js → SkillsSection（约 908 行起），经典脚本 + 本地原语组件；client/client.js 由 node scripts/build-client.mjs 内联 CSS 生成。
- 仓库分组：groups 由 skills 按 repo.id 归并，仓库排序「有启用在前 → 名称升序」；每组一个 section.skm-repo，组内技能行按「已启用优先 → 名称」。
- 折叠：collapsedRepos 仅是组件内 useState({})，刷新即重置；只有每个仓库自己的 chevron，没有全局控制。
- 更新：Host 已有 POST /repos/check-updates（逐个仓库 git ls-remote，写入 latestCommit/checkedAt）；/state 派生 updateAvailable；客户端只有手动「检查更新」按钮，仓库/技能行有「可更新」标签，**没有自动检查、没有提示横幅、没有批量更新入口**。
- 更新执行：manager.updateRepo(repoId) 已实现（重新克隆 → 新快照 → 刷新技能元数据 → 清理旧快照），但**没有对外的 /repos/update 路由**，只能通过 POST /skills/update（按技能名）间接触发。
- 最近操作：GET /logs 返回内存环形缓冲（300 条，最多 80 条随 /state）；客户端在工具栏有开关，展开后在页面**底部内联**渲染 .skm-events（eventsBlock），不是弹窗。
- 日志实现：createEventLog(300) 只写内存 + 追加 logs.jsonl；**启动时不读回历史**，重启后「最近操作」为空。

---

## 2. 需求分析与交互草案

### 2.1 需求 1：按仓库来源全局折叠 / 展开（只做一层，默认折叠）

- 入口放在顶部工具区（概览行右侧，批量启用/停用一组之后）。
- 一个按钮，两种状态：
  - 当前存在任意展开分组 → 显示「全部折叠」；点击后所有仓库分组收起。
  - 全部已折叠 → 显示「全部展开」；点击后所有仓库分组展开。
- 默认（从未操作过、或新出现的仓库）**折叠**，只看到仓库卡片头：来源名、外链、ref/commit、数量、开关、导入更多、可更新角标。
- 不改变技能行的展开状态（单层语义，你已确认）。
- 状态存 localStorage，键 dsh-skills-tools:ui:v1，形如：

~~~json
{ "open": { "repo_ab12...": true }, "updateDismissed": "repo_a:c1|repo_b:c2" }
~~~

  open[id] === true 表示展开；缺失表示折叠。全局展开=把当前所有仓库 id 置 true；全局折叠=清空 open。仓库被移除后旧 id 自然失效，不需要迁移。
- 搜索兜底：当搜索框有内容时，**忽略折叠状态**，直接展示命中的分组与技能行（否则搜索看起来没结果）；清空搜索后恢复用户原来的折叠状态，不写回存储。
- 导入成功后：自动展开刚导入的仓库（commitImport 响应补 repo id），避免"导入完看不见"。

~~~
┌ 技能 ─────────────────────────────── 刷新  导入技能 ┐
│ 已启用 6 / 已导入 12 · DSH 已加载 6                  │
│ [全部启用] [全部停用] [全部展开 ⌄] [检查更新] [最近操作] │
│ 🔍 搜索            [全部 12] [已启用 6] [已停用 6]     │
│ ┌ 📦 acme/design-skills      main · a1b2c3d  2/3  ┐ │
│ │   ↑ 默认折叠，只显示仓库头                        │ │
│ ├ 📦 acme/ops-skills         main · e4f5g6h  3/3  ┤ │
│ └ 📁 D:\skills\local          本机目录         1/1  ┘ │
└ 数据目录 ~/.dsh/dsh-skills-tools ────────────────────┘
~~~

### 2.2 需求 2：上游更新检查与提示

- **检查时机**：打开设置页后自动检查一次（若距上次检查 ≥ 30 分钟）；页面可见期间每 30 分钟复查；document.visibilityState === "hidden" 时不查，切回可见且已过期时补一次。手动「检查更新」按钮不受节流限制。
- **检查范围**：只查 kind === "git" 的仓库；本机目录跳过（没有远端）。逐个 git ls-remote，并发上限 4，单仓库超时 20 秒，单个失败不影响其它仓库。
- **提示**：顶部横幅（仓库角标保留）：

~~~
⚠ 2 个仓库有新提交        [全部更新] [查看] [×]
~~~

  - 「查看」：展开有更新的仓库并滚动到第一个。
  - 「×」：按 repoId:latestCommit 签名记住，本次不再提示；出现新的提交（签名变化）时重新出现。
  - 全部更新完成后横幅自动消失（updateAvailable 变 false）。
- **更新执行**：新增 POST /repos/update（单仓库）；「全部更新」由客户端串行循环调用，展示进度 正在更新 2/3…，失败不中断，结束后汇总成功/失败；执行前弹确认框（复用 ConfirmDialog）。
- **状态展示**：检查按钮的 title 显示「上次检查 HH:mm」；检查失败只在「最近操作」里记一条 warn，不用横幅打扰。
- 自动检查静默：不显示 loading 骨架，不打断正在进行的操作；只有发现新提交才出横幅。

~~~
⚠ 1 个仓库有新提交                         [全部更新] [查看] [×]
┌ 📦 acme/design-skills   main · a1b2c3d  [可更新]   2/3 ┐
│ ─────────────────────────────────────────────────── │
│ ● design-review        更新仓库后自动切换新快照          │
└─────────────────────────────────────────────────────┘
~~~

### 2.3 需求 3：「最近操作」改为弹窗

- 删除页面底部内联的 eventsBlock；工具栏「最近操作」按钮改为打开 Modal。
- 弹窗尺寸 normal（640px，与移除确认框一致），标题「最近操作」，副标题「本机操作记录，最多保留 300 条」。
- 打开时 GET /logs?limit=200 拉取最新记录；底栏提供「刷新 / 复制 / 清空」，清空需二次确认（按钮就地变「确认清空」）。
- 行样式（紧凑列表）：

~~~
┌ 最近操作                                        [×] ┐
│ 本机操作记录，最多保留 300 条                       │
│ 11-06 14:02  ● 已从上游更新 design-review           │
│ 11-06 13:58  ● 已启用 ui-copywriting                │
│ 11-05 09:12  ▲ 检查更新失败：1 个仓库                │
│ 11-04 20:55  ● 从 acme/ops-skills 导入 3 个 skill   │
│ …（可滚动）                                         │
├ 共 42 条          [刷新] [复制] [清空]              ┤
└─────────────────────────────────────────────────────┘
~~~

- 级别：info / warn / error 用 6px 圆点着色（label-tertiary / state-warning-primary / state-error-primary）；有 skill 字段时在消息前显示 code 名。
- Host 顺带增强：createEventLog 启动时读回 logs.jsonl 最后 300 行（容错坏行），让弹窗在重启后仍有历史；新增 clear() 清空内存与文件。

---

## 3. 详细设计

### 3.1 客户端状态与存储

新增常量与工具（client/client.src.js 顶部）：

~~~js
var UI_STORE_KEY = "dsh-skills-tools:ui:v1";
var AUTO_CHECK_MS = 30 * 60 * 1000;
function readUiStore() { try { return JSON.parse(localStorage.getItem(UI_STORE_KEY)) || {} } catch (e) { return {} } }
function writeUiStore(next) { try { localStorage.setItem(UI_STORE_KEY, JSON.stringify(next)) } catch (e) {} }
~~~

SkillsSection 新状态：

| 状态 | 用途 |
| --- | --- |
| ui / setUi | { open: {repoId:true}, updateDismissed: string } 的单一来源，初始化自 localStorage |
| logs / logsState | 弹窗数据：{ list, loading, error } |
| clearConfirm | 清空按钮二次确认 |
| updateAll | null 或 { done, total, failed: [] } |
| autoCheckAt | 上次自动检查时间（内存；持久值优先用 max(repos[].checkedAt)） |

折叠派生：

~~~js
var searching = query.trim().length > 0;
function repoOpen(repo) { return searching ? true : ui.open[repo.id] === true; }
function toggleRepoOpen(repo) { setUi(prev => { var open = Object.assign({}, prev.open); if (open[repo.id]) delete open[repo.id]; else open[repo.id] = true; return Object.assign({}, prev, { open: open }) }) }
function setAllOpen(all) { setUi(prev => ({ open: all ? repos.reduce((acc, r) => { acc[r.id] = true; return acc }, {}) : {}, updateDismissed: prev.updateDismissed })) }
~~~

工具区按钮文案：someOpen = repos.some(r => !searching && ui.open[r.id]) ? t("collapseAll") : t("expandAll")；点击按当前状态二选一。

### 3.2 Host：checkUpdates 重构

~~~js
async checkUpdates() {
  const state = loadState();
  const targets = state.repos.filter(r => r.kind !== 'local');
  const results = await mapLimit(targets, 4, async function (repo) {
    try {
      const head = await remoteHead({ kind: repo.kind, url: repo.url, ref: repo.ref, subdir: repo.subdir || '' }, { timeoutMs: 20000 });
      return { id: repo.id, commit: repo.commit, latestCommit: head.commit || null, error: null };
    } catch (error) { return { id: repo.id, commit: repo.commit, error: errorText(error) }; }
  });
  return await this.mutate(...apply..., done, { invalidate: false });
}
~~~

要点：

1. **跳过 local**；单个失败不抛错（返回 updates: 0 + 每个仓库的 error）。
2. **不再触发 provider invalidate**：latestCommit 不影响技能内容，避免 DSH 每次检查都重载技能；mutate 增加 { invalidate: false } 选项，仅在 updateRepo 时保持默认 true。
3. 返回结构向后兼容并加汇总：

~~~json
{ "ok": true, "updates": 2, "checkedAt": 1762300000000,
  "repos": [{ "id": "repo_…", "commit": "…", "latestCommit": "…", "updateAvailable": true, "error": null }] }
~~~

4. 有更新时写一条 info 日志（「发现 2 个仓库有新提交」）；有失败时写一条 warn（「检查更新失败：1 个仓库（…）」）。
5. 并发辅助 mapLimit(items, limit, worker) 放 lib/util.js。

### 3.3 Host：新增路由

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| POST | /repos/update | { repoId } | { ok, repo, commit, ref, snapshot }（复用 updateRepo） |
| POST | /logs/clear | {} | { ok, cleared: <条数> } |

- /repos/update 校验 repoId，错误走现有 400 包装。
- updateRepo 内补一条 info 日志：「已更新 <sourceSlug>：<shortCommit>」；updateSkill 的日志保持或由其负责（当前无日志，补一条也可）。
- /logs/clear 调 manager.clearLogs()：记录条数 → log.clear() → 返回。

### 3.4 自动检查调度（客户端）

~~~js
useEffect(function () {
  if (!data) return undefined;
  var gitRepos = (data.repos || []).filter(function (r) { return r.kind !== 'local' });
  if (!gitRepos.length) return undefined;
  var newest = Math.max.apply(null, gitRepos.map(function (r) { return Number(r.checkedAt) || 0 }));
  var run = function () { if (!busy.__check__) checkUpdates({ auto: true }) };
  if (Date.now() - newest >= AUTO_CHECK_MS) run();
  var timer = setInterval(function () {
    if (document.visibilityState === 'hidden') return;
    var last = Number(autoCheckAt.current) || 0;
    if (Date.now() - last >= AUTO_CHECK_MS) run();
  }, 60 * 1000);
  var onVisible = function () { if (document.visibilityState !== 'hidden') run() };
  document.addEventListener('visibilitychange', onVisible);
  return function () { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) };
}, [data !== null]);
~~~

- 定时器每分钟 tick 一次，用「距上次 ≥ 30 分钟」判断，避免页面开着很久后漂移。
- 手动按钮：checkUpdates({ auto:false }) 始终执行。
- 自动检查失败不 setAlert；手动失败仍 toast。
- 检查中按钮显示 checking…（现有逻辑）；自动检查只让按钮转圈，不额外弹提示。

### 3.5 更新横幅与批量更新

- 派生 updates = data.repos.filter(r => r.updateAvailable)。
- 签名 signature = updates.map(r => r.id + ':' + r.latestCommit).sort().join('|')；若 signature === ui.updateDismissed 则不显示。
- 点击「全部更新」→ ConfirmDialog（标题「全部更新」文案「将依次更新 N 个仓库到最新提交，期间技能可能短暂重新加载。继续？」）→ 串行：

~~~js
setUpdateAll({ done: 0, total: updates.length, failed: [] });
for (var i = 0; i < updates.length; i += 1) {
  try { await apiPost('/repos/update', { repoId: updates[i].id }) }
  catch (error) { failed.push({ id: updates[i].id, url: updates[i].url, error: errorMessage(error) }) }
  setUpdateAll({ done: i + 1, total: updates.length, failed: failed.slice() });
}
await load(true);
setAlert({ tone: failed.length ? 'warn' : 'ok', text: failed.length ? t('updateAllFailed', { count: failed.length }) : t('updateAllDone', { count: updates.length }) });
~~~

- 更新期间：横幅按钮禁用，显示 正在更新 2/3… + Spinner；其它写操作（导入、切换）不禁用。
- 更新单个仓库：仓库头/技能详情现有入口保留；技能详情「从上游更新」调 /skills/update（内部 updateRepo）不变。
- 完成后清掉 ui.updateDismissed（签名已失效）。

### 3.6 最近操作弹窗组件

新组件 ActivityDialog（放在 ConfirmDialog 附近）：

~~~js
function ActivityDialog(props) {
  var state = useState({ loading: true, error: "", list: [] });
  var data = state[0], setData = state[1];
  var confirm = useState(false);
  var copied = useState(false);
  var load = useCallback(function () {
    setData(function (prev) { return Object.assign({}, prev, { loading: true, error: "" }) });
    apiGet("/logs?limit=200").then(function (result) {
      setData({ loading: false, error: "", list: result.events || [] });
    }).catch(function (failure) {
      setData({ loading: false, error: errorMessage(failure), list: [] });
    });
  }, []);
  useEffect(function () { load() }, [load]);
  ...
}
~~~

- 行：time | dot | message；event.skill 非空时消息前加 code 名。
- 复制格式：每行 MM-DD HH:mm [INFO|WARN|ERROR] <message>，用 navigator.clipboard.writeText；失败 toast 提示。
- 清空：第一次点击 setConfirm(true)，按钮变「确认清空」；4 秒后自动复位；再次点击 POST /logs/clear → load() → 父级 toast「操作记录已清空」。
- 关闭时重置 confirm / copied。
- 入口：工具栏按钮（现有位置），点击 setEventsOpen(true)；不再渲染内联块。

### 3.7 日志加载与清空（Host）

lib/util.js createEventLog：

- 构造时读取 logsPath()（若存在）：逐行 JSON.parse，保留最后 capacity 条，忽略坏行；不因读取失败抛错。
- 新增 clear()：ring.length = 0；fs.writeFileSync(logsPath(), "", "utf8")（失败静默）；返回清空前的条数。
- manager.clearLogs() 包装；routes.js 暴露 POST /logs/clear。

---

## 4. API 变更汇总

| 接口 | 变更 | 兼容性 |
| --- | --- | --- |
| GET /state | 不变（repos[].checkedAt/latestCommit/updateAvailable 已存在） | 兼容 |
| GET /logs | 不变；启动后现在会包含历史 | 兼容 |
| POST /logs/clear | **新增** | 新增 |
| POST /repos/check-updates | 响应新增 updates / checkedAt；跳过 local；失败不整体报错；不再 invalidate | 兼容（旧字段保留） |
| POST /repos/update | **新增**，单仓库更新 | 新增 |
| POST /skills/update | 不变（内部同样走 updateRepo） | 兼容 |
| POST /import/commit | 响应新增 repo（repoId），供导入后自动展开 | 兼容 |
| POST /repos/import | 不变（已返回 repo） | 兼容 |

---

## 5. 文件级改动清单

| 文件 | 改动 |
| --- | --- |
| lib/util.js | createEventLog 启动回读 + clear()；可选 mapLimit |
| lib/git.js | remoteHead(source, { timeoutMs }) 透传超时到 runGit |
| lib/manager.js | checkUpdates 重构（并发/跳过 local/错误隔离/日志/不 invalidate）；mutate 支持 invalidate:false；clearLogs()；updateRepo 写日志；commitImport 返回 repo |
| lib/routes.js | 新增 /repos/update、/logs/clear |
| client/client.src.js | UI store、折叠派生与全局按钮、自动检查调度、更新横幅、全部更新、ActivityDialog、i18n 键、移除内联 eventsBlock、导入后展开 |
| client/ui.css | 横幅动作区、日志列表/圆点、工具区按钮组；删除 .skm-events 规则 |
| client/client.js | 由 node scripts/build-client.mjs 重新生成并提交 |
| scripts/ci-check.mjs | 新增构建新鲜度断言（client.js 含 collapseAll、logsDesc 等新键） |
| scripts/manager-test.mjs | 新增 updateRepo（local fixture）、clearLogs、checkUpdates 空仓库/不可达 URL 用例 |
| docs/API.md | 新接口、响应字段、自动检查语义 |
| README.md / README.en.md | 功能列表补三条；版本号 1.3.0 |
| docs/release-notes-v1.3.0.md | 发版说明 |
| package.json / dsh-package.json | version → 1.3.0 |

---

## 6. i18n 新增键（zh / en 必须同序，ci-check 会校验）

| key | zh | en |
| --- | --- | --- |
| collapseAll | 全部折叠 | Collapse all |
| expandAll | 全部展开 | Expand all |
| updateBanner | {count} 个仓库有新提交 | {count} repositories have new commits |
| updateBannerOne | 1 个仓库有新提交 | 1 repository has new commits |
| updateAll | 全部更新 | Update all |
| updatingAll | 正在更新 {done}/{total}… | Updating {done}/{total}… |
| updateAllDone | 已更新 {count} 个仓库 | Updated {count} repositories |
| updateAllFailed | {count} 个仓库更新失败 | {count} repositories failed to update |
| viewUpdates | 查看 | View |
| dismissUpdate | 关闭提示 | Dismiss |
| logsDesc | 本机操作记录，最多保留 300 条。 | Local activity log, up to 300 entries. |
| logsCount | 共 {count} 条 | {count} entries |
| logsCopy | 复制 | Copy |
| logsClear | 清空 | Clear |
| logsClearConfirm | 确认清空 | Confirm clear |
| logsCleared | 操作记录已清空 | Activity log cleared |
| levelWarn | 警告 | Warning |
| levelError | 错误 | Error |
| updateConfirmTitle | 全部更新 | Update all |
| updateConfirmText | 将依次更新 {count} 个仓库到最新提交，期间技能可能短暂重新加载。继续？ | Update {count} repositories to their latest commits? Skills may reload briefly. |

复用已有键：checkedAt（上次检查 {time}）、events（最近操作）、refresh、copied、eventsEmpty、close、cancel。

---

## 7. CSS 新增（沿用 --dsw-* 与 --skm-* token）

- .skm-toolGroup { display:flex; align-items:center; gap:var(--skm-gap-sm); flex-wrap:wrap; }
- .skm-banner[data-tone="update"] { border-color: var(--dsw-alias-state-warning-primary); }
- .skm-bannerActions { display:flex; gap:var(--skm-gap-sm); margin-left:auto; flex:none; flex-wrap:wrap; }
- .skm-logList { display:flex; flex-direction:column; max-height:min(52vh,420px); overflow:auto; }
- .skm-logRow { display:grid; grid-template-columns:auto auto minmax(0,1fr); align-items:start; gap:8px; padding:7px 2px; border-bottom:var(--skm-hairline) solid var(--dsw-alias-border-l1); font-size:var(--skm-fs-tiny); line-height:16px; }
- .skm-logRow:last-child { border-bottom:0; }
- .skm-logTime { color:var(--dsw-alias-label-tertiary); font-variant-numeric:tabular-nums; white-space:nowrap; }
- .skm-logDot { width:6px; height:6px; margin-top:5px; border-radius:50%; background:var(--dsw-alias-label-tertiary); }
- .skm-logDot[data-level="warn"] { background:var(--dsw-alias-state-warning-primary,#c98a00); }
- .skm-logDot[data-level="error"] { background:var(--dsw-alias-state-error-primary); }
- .skm-logMsg { color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
- .skm-logMsg code { margin-right:6px; font-family:var(--dsw-font-family-mono,ui-monospace,Menlo,monospace); }
- .skm-modalFooter .skm-logMeta { margin-right:auto; color:var(--dsw-alias-label-tertiary); font-size:var(--skm-fs-tiny); }

---

## 8. 边界与失败模式

1. **默认全折叠可能让老用户"看不到技能"**：仓库头保留数量、可更新标签；发布说明明确；搜索会临时展开。
2. **localStorage 不可用**（隐私模式/禁用）：读写 try/catch，降级为会话内状态；不报错。
3. **local 仓库不参与更新检查**；updateAvailable 恒 false。
4. **远端不可达/无凭据**：checkUpdates 记录 lastError，写 warn 日志，不弹错；手动检查仍 toast 错误汇总。
5. **检查期间页面切后台**：定时器跳过；恢复可见时若已过期再查。
6. **全部更新中途失败**：继续后续仓库，横幅保留失败汇总（warn 文案），失败仓库仍显示"可更新"。
7. **全部更新期间用户关闭设置页**：请求继续（HTTP 短请求），下次打开以 /state 为准；无需断点续传。
8. **日志被清空**：按钮二次确认；清空后弹窗显示空态；DSH 其它逻辑不受影响。
9. **日志文件损坏/超大**：启动只读最后 300 行，坏行忽略；文件读取失败不影响启动。
10. **同名/多仓库**：折叠按 repo.id，互不影响；仓库删除后 localStorage 中旧键自然失效。
11. **搜索 + 折叠交互**：搜索时强制展开且不写入 localStorage，清空搜索恢复。
12. **筛选（全部/已启用/未启用）+ 全折叠**：只显示有命中的仓库头；用户可全局展开或搜索。

---

## 9. 测试与验收

### 9.1 单元/静态（离线，CI 必跑）

- npm test（smoke）：新增对 client 产物的少量断言（含新键）。
- npm run test:manager：
  - local fixture 导入后 updateRepo(repoId)：快照 commit 不变、技能描述随文件更新、日志新增一条。
  - clearLogs()：清空前计数、清空后 /logs 为空、logs.jsonl 被截断。
  - checkUpdates()：空仓库返回 updates: 0；不可达 URL 仓库返回 error 且不抛、updates: 0。
- npm run ci-check：i18n 键同序、client 构建新鲜度、无本地路径泄漏。
- npm run test:provider：不变，保持通过。

### 9.2 隔离环境 E2E（临时 DSH_HOME + profile + Playwright）

1. 首次打开：所有仓库默认折叠；点「全部展开」→ 全部出现；刷新页面 → 保持展开（localStorage）。
2. 点「全部折叠」→ 只剩仓库头；刷新 → 保持折叠。
3. 搜索关键字 → 命中仓库自动展开；清空搜索 → 恢复折叠。
4. 构造"有更新"状态（state.json 写入不同 latestCommit）→ 打开面板出现横幅与「可更新」角标；点 × 后消失；刷新不出现。
5. 点「全部更新」→ 确认框 → 进度文案 → 成功后横幅消失（用可更新的 fixture 或 mock 路由）。
6. 「最近操作」：不再有内联块；点工具栏按钮开弹窗；列表显示时间/色点/消息；复制成功；清空二次确认后空态；Esc/遮罩关闭。
7. 回归：仓库开关半选、导入更多、技能展开 SKILL.md、单个更新、移除确认、导入对话框均不受影响。

### 9.3 手工清单

- 亮/暗色对比、窄宽度（<640px）下工具栏换行、弹窗滚动、键盘 Tab 焦点、读屏 aria（role="dialog" 由 Modal 提供）。

---

## 10. 里程碑与工作量

| 里程碑 | 内容 | 预估 | 验收 |
| --- | --- | --- | --- |
| M1 | Host：checkUpdates 重构、/repos/update、/logs/clear、日志回读、commitImport 返回 repo | 0.5–0.75 天 | 单测通过、无 invalidate 抖动 |
| M2 | 客户端：UI store + 全局折叠 + 默认折叠 + 搜索兜底 | 0.5 天 | E2E 1–3 |
| M3 | 客户端：自动检查调度 + 横幅 + 全部更新 + 确认/进度/汇总 | 1 天 | E2E 4–5 |
| M4 | 客户端：ActivityDialog + 复制/清空 + 工具栏改造 | 0.5 天 | E2E 6 |
| M5 | i18n/CSS/构建/文档/发版说明/screenshots（可选） | 0.5–0.75 天 | 全部测试 + 手测 |

总计约 **3–3.5 天**（不含你审阅与 npm 发布等待）。

---

## 11. 发版

1. 版本 → 1.3.0（package.json + dsh-package.json）。
2. node scripts/build-client.mjs 重建 client/client.js。
3. 跑全量检查：npm test、npm run test:manager、npm run test:provider、npm run ci-check、npm pack --dry-run。
4. 更新 README/README.en 与 API.md、新增 docs/release-notes-v1.3.0.md，必要时重拍/新增截图（docs/screenshots）。
5. 提交、打 tag v1.3.0、GitHub Release。
6. npm 发布需要你的 OTP；注意 **v1.2.0 从未发布**，1.3.0 会同时带上稀疏克隆。

---

## 12. 已排除的备选方案（记录）

| 需求 | 备选 | 排除原因 |
| --- | --- | --- |
| 折叠范围 | 每个仓库再提供"折叠该仓库全部技能行" | 你选择只做全局一层，避免层级过多 |
| 折叠记忆 | 写入 state.json 跨设备同步 | 会改宿主状态、可能触发技能刷新；localStorage 更轻 |
| 检查时机 | 宿主后台定时（每 6 小时） | 不开设置页也发网络请求，需要新配置项；当前方案已覆盖使用场景 |
| 提示方式 | 首次发现弹对话框 | 打断操作；横幅 + 角标更轻，且可随时查看 |
| 日志弹窗样式 | 日期分组时间线 / 四列表格 | 紧凑列表与现有设置页风格最一致，信息密度最高 |
| 更新粒度 | 只提示不提供入口 | 你选择逐仓库 + 全部更新 |

---

## 13. 待你确认（不阻塞初版实现，但影响细节）

1. **搜索时自动展开命中仓库**：按方案实现（推荐）。
2. **「全部更新」不可取消**：串行短请求，失败不中断；若你希望可取消，需要加 Abort 与半途状态，工作量 +0.25 天。
3. **清空日志**：保留二次确认；若你不想提供清空入口，可去掉（工作量 -0.1 天）。
4. **发版**：确认目标 1.3.0，并接受「1.2.0 未发布 → 1.3.0 一起发」。
5. **截图**：是否在实现后更新 README 截图（默认更新 overview / 新增 events-dialog 截图）。
