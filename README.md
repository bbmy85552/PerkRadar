# PerkRadar

PerkRadar 是一个本地运行的优惠线索聚合器。它读取固定的公开 RSS、Atom、JSON 和 Markdown 来源，把标题、原文链接和短摘要整理到 PostgreSQL，再用网页看板帮助你搜索、筛选、收藏和标记已领。默认不会在进程内自动抓取，需要由外部定时器请求刷新接口。

它的定位是“先把线索集中起来”，不是逐条认证的领取平台。页面里的一条记录只代表对应来源曾返回过这条内容，不代表活动仍然有效、领取条件已经核实、账户一定有额度，也不代表 PerkRadar 已经打开原文逐条确认。使用时请把原文页面作为最终依据。

## 推荐安装方式：交给 Personal Agent 部署

本项目最推荐的安装方式是：将仓库链接交给 muse、grokbot、hark 等 Personal Agent（个人智能体），让它协助在你自己的云空间完成部署，并配置每小时或每两小时推送一次新增优惠资讯。这样无需反复打开网页，也能及时掌握最新优惠线索。

部署、定时任务与消息推送需由所选 Personal Agent 根据其能力配置。PerkRadar 默认由外部每 2 小时触发一次抓取，本身不发送通知；推送内容以最近一次成功抓取的结果为准。

## 快速开始

### 环境要求

- Node.js 20 或更高版本（CI 与 Docker 镜像使用 Node.js 22）
- npm
- 可访问的 PostgreSQL 数据库（通过 `DATABASE_URL` 连接）
- 如果使用 Docker，需要 Docker Desktop 或兼容 Docker Compose 的环境（Compose v2.24 或更高版本）

依赖版本锁在 `package-lock.json` 中。复制 [`.env.example`](.env.example) 为本地 `.env`，填入 `DATABASE_URL` 和 `CRON_SECRET`，不要把真实凭证提交到 Git。

### 用 Docker 运行

这是推荐的本机运行方式。它会构建生产镜像并启动容器。请先在环境或 `.env` 中提供 `DATABASE_URL`（以及用于外部刷新的 `CRON_SECRET`）。进程内调度器默认关闭。根目录 `.env` 是可选的（未配置数据库和密钥时需另行注入）；未配置 Jina API Key 时无需创建该变量。需要鉴权时可通过 `JINA_API_KEY` 配置，也可设置 `JINA_API_KEY_FILE` 指向容器内可读取的密钥文件。`.secrets/` 不会复制进镜像，文件方式需要由运行环境单独挂载到容器。

```bash
docker compose -p daily-free-info up -d --build
```

打开 [http://127.0.0.1:38471/](http://127.0.0.1:38471/)，或先检查服务健康状态：

```bash
curl -sS http://127.0.0.1:38471/api/health
```

默认只绑定到本机回环地址 `127.0.0.1`，不会自动提供公网访问。宿主端口被占用时，只替换宿主端口，容器内端口仍保持 `38471`：

```bash
HOST_PORT=38481 docker compose -p daily-free-info up -d --build
```

此时访问 [http://127.0.0.1:38481/](http://127.0.0.1:38481/)。完整的启停、日志、备份、恢复和回滚说明见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

### 用 npm 开发

```bash
npm ci
npm run dev
```

开发服务器监听 `0.0.0.0:38471`，打开 [http://127.0.0.1:38471/](http://127.0.0.1:38471/)。开发模式同样需要 `DATABASE_URL`，首次启动不会自动抓取；需要时在页面点「立即刷新」，或按下述方式用带密钥的请求触发一轮抓取。不会灌入示例优惠。

本地设计预览页 `/demo` 只在开发环境提供，用于查看界面布局和交互示例：

[http://127.0.0.1:38471/demo](http://127.0.0.1:38471/demo)

生产镜像不包含 `/demo` 路由。

## 页面能做什么

- 按标题搜索，使用字面包含匹配
- 按来源和分类筛选，并支持排序
- 查看本轮新增
- 收藏条目、标记已领
- 打开规范化后的原文链接
- 手动触发刷新，并查看刷新冷却、来源成功数和异常提示
- 查看当前在架条目、最近一轮状态、逐来源结果和数据新鲜度

首页的“全部”视图默认隐藏分类为“其他”的线索，因为综合订阅源可能包含闲聊、求购、抽奖、推广和新闻。点击“查看全部线索”可以显示它们；显式选择“其他”或“我的收藏”时不会隐藏。这个行为只影响页面展示，不会删除数据库记录，也不会改变抓取源和分类规则。

收藏与已领状态只保存在当前浏览器的 `localStorage`：

- `daily-deals-personal-v1`：`{ "claimed": string[], "favorites": string[] }`
- `daily-deals-show-all-v1`：是否显示“其他”线索

这些状态不会上传到服务端，也不会写入数据库。清除浏览器站点数据会清除它们。

## 数据来源与处理方式

当前使用七个固定来源。来源地址写在 [`src/lib/source-defs.ts`](src/lib/source-defs.ts) 中，应用调用方不能替换。

| 来源 | 格式 | 主要规则 |
| --- | --- | --- |
| LINUX DO 福利羊毛 | 经 Jina 转换的 Markdown | 解析福利区主题标题、主题链接和 RFC822 日期 |
| V2EX 推广 | Atom | 使用 `promotions.xml`，去掉链接中的 `#reply0` |
| Epic | JSON | 只收录当前时间处于促销窗口内、折扣价为 0 的促销 |
| NodeSeek | RSS / Atom | 收录允许域名内的 feed 条目 |
| 小众软件 | RSS / Atom | 收录允许域名内的 feed 条目 |
| 果核剥壳 | RSS / Atom | 收录允许域名内的 feed 条目 |
| 异次元软件世界 | RSS / Atom | 请求会跟随重定向到最终地址 |

综合 RSS / Atom 来源使用 7 天留存窗口，并限制条目链接必须位于该来源允许的域名内。来源失败会与其他来源隔离，不会因为某一个来源超时而清空其他来源的数据。每个来源的请求超时为 25 秒，单个 feed 最多解析 2000 条，响应累计超过 150 万字符会停止读取。

链接会在入库前校验并规范化：只接受 `http` 和 `https`，拒绝过长链接、带 `user:pass@` 凭证的链接和跨来源域名链接。标题最多保存 300 个字符，摘要最多保存 160 个字符；来源没有提供简介时保持为空，不自行补写价格、日期或领取条件。

Epic 条目的 `expiresAt` 来自当前免费促销的结束时间。其他来源没有真实活动截止时间，页面中的“近 7 天”是数据库留存规则，不是活动到期日。

分类是标题关键词分类，不是人工审核：

- Epic 来源：游戏
- 非 Epic 的抽奖、开奖、抽取、求购、求助、闲聊、讨论、新闻、公告、更新、评测、避雷、吐槽、预测、明显问句和明确收/求对象请求：其他
- Epic、游戏、喜加一、Steam：游戏
- 会员、订阅、Pro：会员订阅
- 限免、免费领取：限免
- 白嫖、免费、永免：免费白嫖
- 折扣、优惠码、大促、降价、打折、爆降：低价优惠
- 其他情况：其他

低相关内容只改变展示分类，不删除来源记录；打开“查看全部线索”仍可查看。收/求规则只匹配明确对象，不以单字“收”或“求”拦截，因此“收款工具限免”仍会保留。分类结果不能当成领取资格或优惠真实性证明。来源边界、时间规则和每轮验收清单见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)，来源使用条件见 [docs/SOURCES.md](docs/SOURCES.md)。

## 刷新和新鲜度

默认情况下，进程**不会**自己定时抓取。需要由外部调用方（本机 cron、GitHub Actions，或以后的 Vercel Cron）请求刷新接口，才会跑一轮。只有显式设置 `ENABLE_SCHEDULER=1` 时，才会在进程内于启动约 4 秒后抓一轮、之后每 2 小时再抓一轮；生产 Docker 和 Vercel 不要打开这个开关。

- 没有外部定时请求时，数据不会更新
- 错过的轮次不会补抓，下一次外部请求只会再跑一轮
- 手动刷新和外部刷新共用进程内锁，同一时间只允许一轮运行（多个无服务器实例之间这把锁不共享）
- 页面上的手动刷新有 60 秒冷却，并限制同一 IP 在 10 分钟内最多触发 8 次；带密钥的外部刷新不受这两项限制
- 最近一轮超过 2.5 小时会标记为过时，超过 4 小时会标记为严重过时
- 程序不会发送邮件、聊天消息或系统通知

`/api/health` 的 `ok: true` 只表示进程能够读取 PostgreSQL，不表示数据新鲜，更不表示每条线索都有效。判断数据状态时，应同时查看 `sourceHealth`、`failures`、`fetchedAt`、`freshness` 和 `anomalies`。

## API

三个接口都使用 `cache-control: no-store`。

### `GET /api/health`

读取服务和最近一轮抓取状态。数据库不可读时返回 HTTP 503。

```bash
curl -sS http://127.0.0.1:38471/api/health
```

重点字段：

- `ok`：进程是否能读取数据库
- `sourceHealth`：最近一轮成功的来源数和来源总数
- `failures`：最近一轮失败的来源及错误信息
- `fetchedAt`：最近一轮结束时间
- `freshness`：是否过时或严重过时
- `anomalies`：全失败、来源返回 0 条、条数骤降、连续失败达到 3 轮、解析结构异常等提示
- `sources[].quality`：每个来源近 8 条已结束轮次的连续失败数、条数骤降、解析结构异常和简短 warning；历史查询有上限，不新增数据库表

### `GET /api/deals`

返回网页看板所需的完整 `BoardState`，包括当前条目、来源状态、刷新状态、最近一轮结果、新鲜度和来源质量告警。

```bash
curl -sS http://127.0.0.1:38471/api/deals
```

### `POST /api/refresh` 与 `GET /api/refresh`

触发一次抓取。请求不需要 body。

页面上的「立即刷新」走同源 `POST`，仍然受 60 秒冷却和每 IP 限流约束。外部定时器应携带密钥，走不受手动冷却限制的调度路径：

```bash
# Authorization Bearer（推荐，Vercel Cron 也会带这个头）
curl -sS -X POST http://127.0.0.1:38471/api/refresh \
  -H "Authorization: Bearer $CRON_SECRET"

# 也可以用 X-Cron-Secret 或 X-Refresh-Secret
curl -sS -X POST http://127.0.0.1:38471/api/refresh \
  -H "X-Cron-Secret: $CRON_SECRET"

# Vercel Cron 默认发 GET，同样需要密钥
curl -sS http://127.0.0.1:38471/api/refresh \
  -H "Authorization: Bearer $CRON_SECRET"
```

本机 crontab 示例（每 2 小时，把密钥放在环境变量里，不要把真实密钥提交到仓库）：

```cron
0 */2 * * * curl -fsS -X POST http://127.0.0.1:38471/api/refresh -H "Authorization: Bearer $CRON_SECRET"
```

仓库里的 `vercel.json` 提供了每 2 小时调用 `/api/refresh` 的 Cron 示例；真正部署到 Vercel 时还需要配置 `DATABASE_URL` 和 `CRON_SECRET`，见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

常见响应：

| 状态码 | 含义 |
| --- | --- |
| `200` | 抓取完成并返回最新看板数据 |
| `400` | 请求体超过允许大小 |
| `401` | 缺少或错误的刷新密钥，或密钥已配置时来自公网的未认证请求 |
| `403` | 跨站刷新请求被拒绝 |
| `409` | 已有一轮刷新正在运行 |
| `429` | 仍在冷却期或触发频率限制（仅手动刷新） |
| `500` | 未分类的刷新错误 |

配置了 `CRON_SECRET` 或 `REFRESH_SECRET` 之后，未带密钥的公网刷新会被拒绝。同源的页面按钮仍然可用。不要在未设置密钥的情况下把刷新接口暴露到公网。相关边界见 [SECURITY.md](SECURITY.md)。

## 项目结构

```text
src/
├── app/
│   ├── api/deals/       # 当前条目与看板数据
│   ├── api/health/      # 健康和新鲜度状态
│   ├── api/refresh/     # 手动或外部触发刷新
│   ├── demo/            # 仅开发环境的设计预览
│   └── page.tsx         # 正式首页
├── components/
│   ├── deal-board.tsx   # 搜索、筛选、排序、刷新和本地状态
│   └── deal-board.css   # 正式页与 demo 共用样式
├── lib/
│   ├── parse/           # 各来源解析器
│   ├── db.ts            # PostgreSQL 读写
│   ├── refresh.ts       # 抓取编排、锁和失败隔离
│   ├── scheduler.ts     # 可选的进程内调度（默认关闭）
│   ├── classify.ts      # 标题关键词分类
│   ├── filter-deals.ts  # 页面筛选和排序
│   ├── board-view.ts    # 客户端响应校验
│   ├── source-defs.ts   # 固定来源和允许域名
│   └── types.ts         # 看板和来源数据类型
tests/                   # 离线测试和脱敏夹具
docs/                    # 开发、运维、数据质量和来源说明
scripts/                 # 手动抓取报告等维护脚本
.env                      # 本地密钥与 DATABASE_URL，不提交到 Git
```

## 开发与验证

安装依赖后，按下面顺序执行：

```bash
npm ci
npm test
npm run lint
npx --no-install tsc --noEmit
npm run build
git diff --check
```

测试使用 `tests/fixtures/` 和合成样本，在进程内的 PGlite（嵌入式 PostgreSQL）上运行，不访问外网，也不写入生产数据库。`npm run report` 会访问真实来源并写入 `DATABASE_URL` 指向的数据库，只应在明确需要实时抓取时使用；不要把它指向正在使用的生产库。

GitHub Actions 的常规 CI 会运行离线测试、Lint、生产构建和生产依赖审计。实时来源探测是单独的定时工作流，不作为 Pull Request 的必过检查，因为上游故障、反爬挑战或 feed 结构变化不应阻断无关代码的合并。

动到页面时，还需要在 1440、1280 和 390 像素宽度下检查真实页面，确认没有控制台错误、失败请求、横向溢出、文本裁切或关键控件重叠。完整开发约定见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 运维和安全

常用 Docker 命令：

```bash
docker compose -p daily-free-info ps
docker compose -p daily-free-info logs -f --tail=200
docker compose -p daily-free-info restart
docker compose -p daily-free-info stop
docker compose -p daily-free-info start
```

数据保存在 `DATABASE_URL` 指向的 PostgreSQL 中。备份请使用 `pg_dump`，不要把连接字符串或密码写进仓库；步骤见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

生产容器以非 root 的 `node` 用户运行。不要把数据库凭证写进镜像，通过环境变量或 Compose 的 `.env` 注入。

日志统一使用 `[deals]` 前缀的单行 JSON，记录轮次、来源成功与失败、耗时和失败分类，不记录标题正文、Cookie、请求头或浏览器个人状态。结构化日志字段见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

发现内容错误、失效条目或来源问题时，请附原文链接、发现时间和期望行为，通过仓库的 Issue 模板反馈。漏洞不要公开发布可复现细节，按 [SECURITY.md](SECURITY.md) 的私密报告流程提交。

## 文档索引

- [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md)：来源、解析、分类、留存、时效和每轮验收规则
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：架构、目录、命令、API 字段、日志和视觉验收
- [docs/OPERATIONS.md](docs/OPERATIONS.md)：Docker 启停、排障、备份、恢复和回滚
- [docs/SOURCES.md](docs/SOURCES.md)：来源清单、字段边界、使用条件和移除渠道
- [CONTRIBUTING.md](CONTRIBUTING.md)：本地准备、测试约定和新增来源要求
- [SECURITY.md](SECURITY.md)：漏洞报告和公网部署边界
- [CHANGELOG.md](CHANGELOG.md)：版本变更记录
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：第三方依赖许可说明
- [AGENTS.md](AGENTS.md)：本仓库维护规则

## 许可证

本项目采用 [MIT License](LICENSE)。你可以自由使用、修改和商用，但需要保留版权与许可证声明。第三方依赖的许可义务见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。来源站点的内容和使用条件不由本仓库的 MIT 许可证覆盖。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=luobinger/PerkRadar&type=Date)](https://star-history.com/#luobinger/PerkRadar&Date)
