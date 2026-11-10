# 运维

命令都在项目目录执行，并且只带 `-p daily-free-info`。不要对其他目录 `docker compose down`，不要 `docker system prune`，不要 `docker compose down` 不带项目名。默认只把端口发布到 `127.0.0.1`，不是公网。

本项目的数据在 `DATABASE_URL` 指向的 PostgreSQL 里。进程内调度器默认关闭，需要由外部定时请求 `/api/refresh` 才会抓取。机器休眠、关机、Docker Desktop 没启动，或这个容器被 stop，页面会停，外部 cron 若打到已停止的进程也会失败。`restart: unless-stopped` 只在 Docker 自己还在运行、且容器不是被手动 stop 时拉起它。

## 日常命令

先准备好 `.env`（可从 [`.env.example`](../.env.example) 复制），至少包含 `DATABASE_URL` 和 `CRON_SECRET`。不要把真实凭证提交到 Git。Compose 会从环境或项目目录的 `.env` 读取这两个变量。

```bash
docker compose -p daily-free-info config
docker compose -p daily-free-info up -d --build
docker compose -p daily-free-info ps
docker compose -p daily-free-info logs -f --tail=200
docker compose -p daily-free-info restart
docker compose -p daily-free-info stop
docker compose -p daily-free-info start
```

`config` 用来检查这次会使用的项目名、端口和环境变量是否被注入，不会启动容器。检查时不要把含密码的 `DATABASE_URL` 贴到日志或聊天里。`up -d --build` 构建镜像并启动。容器名是 `daily-free-info`，镜像名是 `daily-free-info:local`。启动时会自动对目标库执行 `CREATE TABLE IF NOT EXISTS`，只应指向专用的 PerkRadar 数据库，不要指向其他应用的库。

容器以镜像内置的 `node` 用户（uid 1000）运行，不是 root。不要把密钥写进镜像。

访问：

```bash
curl -sS http://127.0.0.1:38471/api/health
curl -sS http://127.0.0.1:38471/api/deals
curl -sS -X POST http://127.0.0.1:38471/api/refresh \
  -H "Authorization: Bearer $CRON_SECRET"
```

配置了 `CRON_SECRET` 或 `REFRESH_SECRET` 之后，不带密钥的刷新请求会被拒绝（401），本机排障也要带上面这个头。也可以使用 `X-Cron-Secret` 或 `X-Refresh-Secret`。未配置密钥时，不带 `Origin` 的 `POST` 仍会放行，这只适合本机调试，不要把这种状态暴露到公网。带 `sec-fetch-site: cross-site` 或与 `Host` 不符的 `Origin` 会被拒绝 403。接口防护细节见 [SECURITY.md](../SECURITY.md)，结构化日志见 [DEVELOPMENT.md](DEVELOPMENT.md)。

推荐用系统 cron、systemd timer 或 GitHub Actions 每 2 小时请求一次刷新接口。仓库中的 `vercel.json` 提供了同样间隔的 Cron 示例，但本仓库不会自动部署到 Vercel。

若 38471 已被别的程序占用，只改宿主端口，不要改容器内端口，也不要去停别的项目：

```bash
HOST_PORT=38481 docker compose -p daily-free-info up -d --build
curl -sS http://127.0.0.1:38481/api/health
```

健康检查在容器内请求 `http://127.0.0.1:38471/api/health`，每 30 秒一次，超时 5 秒，重试 3 次，启动宽限 60 秒。它通过只说明 HTTP 成功，也就是数据库还能读。

不要同时跑两个会争用同一把进程内刷新锁的应用进程去对同一库做并发刷新。多个实例可以同时读库，但刷新锁不会跨进程共享。

## 排障

| 现象 | 先看什么 |
| --- | --- |
| 浏览器打不开 | `docker compose -p daily-free-info ps`。Docker 是否启动。端口是否用了 `HOST_PORT`。只应访问 `127.0.0.1` |
| 健康 503，`数据库不可读` | `DATABASE_URL` 是否指向正确的库、网络和权限是否可用。不要对其他应用的数据库做迁移或清理。读库失败会记 `health_check_failed` / `deals_read_failed` 日志；`GET /api/deals` 同样会返回 503 `数据库不可读` |
| 来源失败或超时 | `/api/health` 的 `failures`，以及 `docker compose -p daily-free-info logs` 里 `[deals]` 的 `source_round.reason` 与 `error`。25 秒超时记为「超时」（`timeout`）；HTTP 错误状态（`http_status`）、响应过大（`response_too_large`）、格式 / 解析错误（`malformed_response`）各有分类。LINUX DO 格式不对会写明可能被阻断。不要改去直连 |
| 某源 0 条但 `lastOk` 为真 | 这次 feed 解析结果是空的，旧行是否还在由 7 天和到期规则决定 |
| 页面时间看起来差 8 小时 | 页面标签按 `Asia/Shanghai` 格式化。容器未设置 `TZ`，库内是 Unix 毫秒。先对照 `fetchedAt` 和 `fetchedAtBeijing`，不要只看容器 `date` |
| 刷新 401 | 缺少或写错了 `Authorization: Bearer`、`X-Cron-Secret` 或 `X-Refresh-Secret`。页面上的同源「立即刷新」不受此影响 |
| 手动刷新 409 | 已有一轮在跑，等它结束 |
| 手动刷新 429 | 60 秒冷却，或同一 IP 10 分钟超过 8 次（仅手动刷新） |
| 手动刷新 403 | `sec-fetch-site: cross-site`，或 `Origin` 的主机与 `Host` 不一致 |
| 页面很久没有新数据 | 外部 cron 是否在跑、密钥是否正确、容器是否在听。进程默认不会自己每 2 小时抓一次 |
| 停机几小时后只多了一轮 | 代码不会把错过的每 2 小时都补抓一遍 |

构建日志里若再出现安装 TypeScript，说明镜像又在用 `next.config.ts`。当前仓库使用 `next.config.mjs`，启动不应为了配置文件联网安装依赖。

## 备份

不要把 `DATABASE_URL` 或密码写进备份文件名、脚本仓库或 issue。使用 `pg_dump` 对 PerkRadar 自己的数据库做逻辑备份：

```bash
mkdir -p "$HOME/free-info-archives"
pg_dump --format=custom --file="$HOME/free-info-archives/perkradar-$(date +%Y%m%d-%H%M%S).dump" "$DATABASE_URL"
```

如果习惯用拆开的参数，也可以 `pg_dump -h ... -p ... -U ... -d perkradar`，不要把密码写进命令历史能长期保留的脚本；优先用 `.pgpass` 或环境变量。确认命令没有报错之后，再把目标文件改成带日期的名字。不要对其他应用的数据库执行 dump 或 drop。

## 恢复

先按上一节再做一份当前库的备份。然后在确认目标库就是 PerkRadar 使用的那个数据库之后，再恢复：

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$HOME/free-info-archives/perkradar-YYYYMMDD-HHMMSS.dump"
```

恢复完成后：

```bash
docker compose -p daily-free-info start
curl -sS http://127.0.0.1:38471/api/health
```

确认条数和更新时间符合预期之前，不要清掉新做的那份备份。

## 回滚镜像和源码

回滚前保留两样东西：当前还能用的镜像，以及当前源码的 tar。镜像可以用本项目的标签另存，例如：

```bash
docker image tag daily-free-info:local daily-free-info:before-rollback
```

源码和部署包打成 tar，放在仓库外面，例如 `$HOME/free-info-archives/`。不要在项目目录里再展开一份旧源码。`tsconfig.json` 的 `include` 含有 `**/*.ts`，`tsconfig.json` 与 `eslint.config.mjs` 现在排除 `deployment-backups/`；但项目树其它位置若留下旧的 `next.config.ts` 或其他 `.ts`，TypeScript 仍会扫到它们。`deployment-backups` 保持为 tar，不要展开后留在项目树里。

回滚源码时只替换有记录的应用文件，不要用旧包覆盖 `.env`，或用户后来自己加的文件，也不要改 PostgreSQL 里属于其他应用的数据库。换回旧镜像后执行：

```bash
docker compose -p daily-free-info up -d --build
```

只有在明确要使用 `before-rollback` 这个标签、且 Compose 文件也改回对应构建时，才需要另作镜像标签处理。当前 Compose 固定构建 `daily-free-info:local`，所以上面的 `up -d --build` 会按当时目录里的源码重新构建。
