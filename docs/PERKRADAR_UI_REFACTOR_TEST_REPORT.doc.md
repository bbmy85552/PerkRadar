---
title: PerkRadar 界面重构测试报告
subtitle: 2026-11-09 · 本机验收
font: sans
width: wide
---

<!-- 本报告记录 2026-11-09 界面重构与默认隐藏「其他」补充验收的范围、命令证据、浏览器结果和生产容器结果；结论以实际输出和日志为准。 -->

结论：正式首页已按 `/demo` 的信息架构完成重构，并通过单元测试、类型检查、构建、浏览器异常路径和生产容器验收。用户随后决定默认隐藏「其他」闲聊帖并保留「查看全部线索」开关；这项改动也已实现、验收并重建生产容器。可以继续使用 `http://127.0.0.1:38471/`。

## 范围与依据

验收时间是 2026-11-09 06:32—07:56（北京时间）。开发预览用 `http://127.0.0.1:38472/`，生产容器用 `http://127.0.0.1:38471/`。基线健康数据来自 `GET /api/health`：开发验收开始时 7/7 来源、337 条线索、20 条本轮新增、最后更新 06:10；生产容器最终重建后 7/7 来源、361 条线索、3 条本轮新增、最后更新 07:55。

本次只改页面展示、客户端边界校验、样式、测试与文档；补充的展示偏好存在独立键 `daily-deals-show-all-v1`。没有改数据库表结构，没有改抓取源，没有改 `localStorage` 键 `daily-deals-personal-v1` 和 `{ claimed, favorites }` 形状，没有把测试夹具写入 `./data`。生产容器启动后的定时抓取让 `data/deals.db-wal` 与 `data/deals.db-shm` 发生变化，属于程序正常写库，不是手工改库。

证据文件：

| 文件 | 内容 |
| --- | --- |
| [reports/ui-refactor-2026-11-09.log](../reports/ui-refactor-2026-11-09.log) | 测试、lint、类型检查、构建、Docker 重建与生产验收的命令行输出 |
| [reports/browser-adversarial-2026-11-09.log](../reports/browser-adversarial-2026-11-09.log) | 浏览器交互、异常响应、响应式和干净会话的逐项记录 |
| [reports/default-hide-other-2026-11-09.log](../reports/default-hide-other-2026-11-09.log) | 默认隐藏「其他」与查看全部线索的命令、浏览器、生产容器日志 |
| [.mrdayone/verify.md](../.mrdayone/verify.md) | 下次怎么启动、怎么验收，以及 dev/build 共用 `.next` 的坑 |

## 改了什么

| 位置 | 结果 |
| --- | --- |
| `src/components/deal-board.tsx` | 正式工作台按 demo 结构重写：顶部只留品牌和「立即刷新」，搜索、排序、来源、分类、收藏、运行状态和逐源结果在左侧；结果标题行放可见条数、隐藏提示、「查看全部线索」和「只看新增」；卡片保留标题、收藏文字按钮、摘要框、原文信息、标签、打开原文和标记已领。默认在「全部」视图隐藏「其他」，选择用独立键持久化。 |
| `src/components/deal-board.css` | 正式页与本地 `/demo` 共用一套样式；浅色底、`RGB(20,148,130)` 小面积强调；系统字体，不加载外部字体或 CDN；删除旧的 `src/app/demo/demo.css`。 |
| `src/lib/board-view.ts` | 新增客户端边界校验：拒绝 `javascript:` / `data:` / 带凭据 / 超长 URL，截断异常文本，关键结构损坏时拒绝整份数据；状态栏和来源计数从校验后真正能展示的条目推导。 |
| `src/lib/filter-deals.ts` | 保持合法数据排序行为，同时容忍畸形字段；搜索按字面包含，不把输入当正则；新增可选 `includeOther`，省略时保留旧行为，显式 `false` 隐藏「其他」。 |
| `tests/board-view.test.ts` | 新增 9 组对抗性单元测试，覆盖畸形快照、恶意链接、HTML 文本、缺失字段、异常计数和筛选鲁棒性。 |
| `tests/filter.test.ts` | 新增默认隐藏「其他」、开关显示全部、省略参数保持旧行为的单元测试。 |
| `src/app/layout.tsx`、`src/app/page.tsx`、`src/app/error.tsx`、`src/app/loading.tsx`、`src/app/globals.css` | 统一浅色 token、加载/错误页样式，避免嵌套 `main`，并抑制开发浏览器扩展带来的 hydration 属性警告。 |
| `src/app/demo/page.tsx` | 本地 dev 预览现在有 7 条示例，默认隐藏 1 条「其他」；开关只在本页内存生效，刷新重置。生产镜像通过 `.dockerignore` 排除 `src/app/demo/`，因此 38471 的 `/demo` 返回 404 是预期行为。 |
| README、CHANGELOG、CONTRIBUTING、DEVELOPMENT、DATA_QUALITY、OPEN_SOURCE_CHECKLIST | 同步当前布局、验收路径、报告/日志链接和「其他」不是优惠判定的边界。SECURITY、THIRD_PARTY_NOTICES、SOURCES、OPERATIONS 与 issue 模板检查后无旧 UI 表述，仅修正 SECURITY 的过程话和开源清单日期。 |

## 命令检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm test` | 最终 81 项通过、0 失败。首轮 78 通过、2 失败，已修异常提示数组和空列表计数假设；默认隐藏改动补 1 项筛选测试后重跑通过。 | `reports/ui-refactor-2026-11-09.log`、`reports/default-hide-other-2026-11-09.log` |
| `npm run lint` | 退出 0，无告警。 | 同上 |
| `npx --no-install tsc --noEmit` | 退出 0。 | 同上 |
| `npm run build` | 退出 0；本地路由包含 `/`、三个 API 与本地 `/demo`。 | 同上 |
| Docker 内 `npm run build && npm prune --omit=dev` | 成功；镜像内路由只有 `/`、`/_not-found` 和三个 API；`npm audit` 0 项漏洞。 | 同上 |
| `docker compose -p daily-free-info ps` | 最终新容器 `21cf5e6f1ace...`，2026-11-08 23:55:07 UTC 创建，状态 healthy，端口 `127.0.0.1:38471->38471/tcp`。 | `reports/default-hide-other-2026-11-09.log` |

第一次 `npm test` 暴露了两个测试假设问题：异常提示里的数字 `42` 被转成文字，以及空列表还沿用输入里的计数。第二处不只是测试问题：恶意刷新响应里接口声称 2 条、但 1 条链接被安全校验丢弃后，状态栏仍显示 2。已改为从校验后的 `deals` 推导 `activeCount`、`newCount` 和逐源 `activeCount`。默认隐藏改动补了 `includeOther` 筛选测试；最后一次生产页体检又发现正式页底部仍链接到只在 dev 存在的 `/demo`，Next 预取造成 404，移除该链接后再次重建，并复核 81 项测试、lint、类型检查、构建和 `git diff --check` 全部通过。

## 浏览器对抗性测试

| 场景 | 期望 | 实测 |
| --- | --- | --- |
| 正式数据黄金路径 | 搜索、来源、分类、只看新增、收藏、已领、排序、重置都可用 | 14/14 步通过；`.*` 按字面搜索得到空状态；NodeSeek 219 条、只看新增 20 条；已领沉底；原文链接 `target="_blank"`、`rel="noopener noreferrer"`；无 `javascript:` 链接；无横向溢出。 |
| 刷新后本地状态 | 收藏与已领仍在 | 5/5 步通过；`localStorage` 的 favorites/claimed 均为 1。 |
| 跨标签 storage 事件 | 另一个标签改收藏后当前页同步 | 3/3 步通过；「我的收藏 1」更新。 |
| 本地存储写入失败 | 明确提示，不假装成功 | 5/5 步通过；出现 `role="alert"` 的「收藏和已领没能写入这台浏览器…」。 |
| 恶意刷新响应 | 丢弃不安全链接，HTML 只当文字，计数与可见卡片一致 | 2/2 步通过；只显示 1 张安全卡片；状态栏、全部来源和来源胶囊均为 1；`window.__xss` 未定义；无不安全链接；无溢出。 |
| 空库 | 真实空状态，不填假条目 | 4/4 步通过；0 卡片，显示「这一轮没有已收录的条目…」。 |
| 畸形刷新结构 | 保留旧列表，给出格式异常提示 | 4/4 步通过；337 卡片保留，显示「刷新结果格式异常，已保留当前列表。」 |
| 刷新 429 | 保留旧列表，显示限流原因 | 4/4 步通过；337 卡片保留，显示「手动刷新过于频繁，请稍后再试」。 |
| 刷新断网 | 保留旧列表，显示网络异常 | 4/4 步通过；337 卡片保留，显示「网络异常，刷新没有完成」。 |
| 390px 手机宽度 | 折叠筛选可用，不横向溢出 | 6/6 步通过；`innerWidth=390`、`clientWidth=390`、`scrollWidth=390`、`bodyScrollWidth=390`；卡片右边界 374；结果顶部开关右边界 374。 |
| 1280 桌面 / 390 手机 preview check | 无控制台报错、无失败请求、无关键视觉缺陷 | 首次发现左栏「各来源本轮结果」与页脚文字重叠；加 `:not([open])` 隐藏规则和间距后复查通过。 |
| 系统深色模拟 | 记录当前实现 | 页面固定浅色，未实现深色主题；本次不声称深色模式通过。 |
| 默认隐藏与查看全部 | 「全部」视图默认隐藏「其他」，开关显示全部，组合筛选不冲突 | 用户 Chrome 主流程 18/18 步通过：默认 55 可见 / 296 隐藏；打开开关 351；只看新增组合、显式点「其他」分类、重置、刷新后开关保留均通过。demo 预览 8/8 步通过：7 条示例默认隐藏 1 条，打开开关 7 条。 |
| 生产页 `/demo` 预取 | 生产镜像不含 `/demo`，页面不应触发 404 | 最终体检先发现 1 条 `/demo?_rsc=...` 404 和 1 条控制台错误；移除正式页底部「查看设计预览」链接并重建后，干净会话里 `a[href="/demo"]` 为 0、console errors=0、network failed=[]、browser check healthy=true。 |
| 干净浏览器会话 | 排除压测注入自身的累计报错 | 关闭压测会话后重新打开：console errors=0、network failed=[]、browser check healthy=true、visualDefects=[]。 |

压测会话最后累计的 2 条控制台错误和 2 条失败请求，分别来自故意注入的 429 和被浏览器拦下的 `/api/refresh` 请求。它们不是页面自身抛出的错误；干净会话已单独复核为 0 报错、0 失败请求。

## 生产容器验收

默认隐藏改动完成后，`docker compose -p daily-free-info up -d --build` 再次重建成功；最终体检发现并移除生产页 `/demo` 预取链接后又重建一次，最终容器 `21cf5e6f1ace...` 是新实例且 healthy。`GET /api/health` 返回 `ok=true`、`sourceHealth=7/7`、`activeCount=361`、`newCount=3`、`lastUpdatedLabel=2026-11-09 07:55 北京时间`、`nextRefreshLabel=2026-11-09 09:55 北京时间`、`freshness.stale=false`、`anomalies=[]`。

生产首页在 1440px 打开后：默认 56 条可见、305 条「其他」隐藏；打开「查看全部线索」为 361 条；页面没有指向 `/demo` 的链接；console errors=0、network failed=[]、browser check healthy=true。390px 手机宽度下：`innerWidth=390`、`clientWidth=390`、`scrollWidth=390`、`bodyScrollWidth=390`、`overflow=false`、卡片右边界 374、两个结果开关右边界 374，仍显示 56 可见 / 305 隐藏。生产 `/demo` 返回 404，符合 `.dockerignore` 排除本地设计预览的预期；正式页不再预取它。

## 未覆盖与限制

深色模式没有实现，也没有按系统深色验收；本次页面固定浅色。浏览器对抗路径是通过 IDE 浏览器临时改写 `/api/refresh` 完成的，没有另写 Playwright 持久脚本；逐项结果保存在浏览器日志里。没有公网部署、没有真机测试、没有提交 git，也没有替你改变抓取规则或数据库。

用户看到「老黄歇菜了」这类真实数据后指出它和羊毛优惠信息无关，随后决定默认隐藏「其他」并保留「查看全部线索」开关。当前源码在「全部」视图默认隐藏分类为「其他」的线索，显式选择「其他」分类或「我的收藏」仍按用户选择展示；数据库、抓取源、分类规则和 `daily-deals-personal-v1` 形状都不变。是否收紧入库关键词仍属后续选项，未实施。

## 后续决定

默认隐藏「其他」已按用户决定实施并验收，不需要再确认展示策略。剩下的选项只有是否收紧入库关键词或来源规则，尚未实施；它会改变现有收录语义，需要重跑数据质量测试、验收 7 个来源，并确认不会误删真实优惠线索。当前交付不改数据层。
