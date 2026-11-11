"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Info,
  Newspaper,
  Radar,
  RefreshCw,
  Search,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { filterDeals, type DealSort } from "@/lib/filter-deals";
import { normalizeBoardState } from "@/lib/board-view";
import { CATEGORIES, type BoardState, type Category, type DealDTO, type SourceStatus } from "@/lib/types";
import "./deal-board.css";

export type BoardView = "feed" | "me" | "about";

const STORAGE_KEY = "daily-deals-personal-v1";
const SHOW_ALL_KEY = "daily-deals-show-all-v1";
const FILTER_SESSION_KEY = "daily-deals-filters-session-v1";

type Personal = { claimed: string[]; favorites: string[] };
type Alert = { text: string; role: "status" | "alert"; testId: string };
type MeTab = "favorites" | "claimed";

const emptyPersonal: Personal = { claimed: [], favorites: [] };

function loadPersonal(): Personal {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersonal;
    const parsed = JSON.parse(raw) as Partial<Personal>;
    return {
      claimed: Array.isArray(parsed.claimed) ? parsed.claimed.filter((item) => typeof item === "string") : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((item) => typeof item === "string") : [],
    };
  } catch {
    return emptyPersonal;
  }
}

function loadShowAll(): boolean {
  try {
    return localStorage.getItem(SHOW_ALL_KEY) === "1";
  } catch {
    return false;
  }
}

type SessionFilters = {
  query: string;
  sourceId: string | "all";
  category: Category | "all";
  onlyNew: boolean;
  sort: DealSort;
  showAllLeads: boolean;
};

function loadSessionFilters(): Partial<SessionFilters> | null {
  try {
    const raw = sessionStorage.getItem(FILTER_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<SessionFilters>;
  } catch {
    return null;
  }
}

function saveSessionFilters(next: SessionFilters) {
  try {
    sessionStorage.setItem(FILTER_SESSION_KEY, JSON.stringify(next));
  } catch {
    // session persistence is best-effort
  }
}

function parseUrlFilters(): Partial<SessionFilters> {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const next: Partial<SessionFilters> = {};
  const q = sp.get("q");
  if (q) next.query = q;
  const source = sp.get("source");
  if (source) next.sourceId = source;
  const cat = sp.get("cat");
  if (cat && ((CATEGORIES as readonly string[]).includes(cat) || cat === "all")) next.category = cat as Category | "all";
  if (sp.get("new") === "1") next.onlyNew = true;
  if (sp.get("sort") === "expiring") next.sort = "expiring";
  if (sp.get("all") === "1") next.showAllLeads = true;
  if (sp.get("all") === "0") next.showAllLeads = false;
  return next;
}

function hasUrlFilters(): boolean {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return ["q", "source", "cat", "new", "sort", "all"].some((key) => sp.has(key));
}

function readError(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  const value = (data as { error?: unknown }).error;
  return typeof value === "string" ? value : null;
}

function formatSourceQuality(source: SourceStatus): string {
  const quality = source.quality;
  if (!quality) return "";
  if (quality.warning) return `；质量提醒：${quality.warning}`;
  if (quality.consecutiveFailures && quality.consecutiveFailures >= 3) return `；连续失败 ${quality.consecutiveFailures} 轮`;
  if (quality.structureAnomaly) return "；解析结构异常";
  if (quality.countDrop) return "；解析条数骤降";
  return "";
}

function formatSourceOutcome(source: SourceStatus): string {
  const quality = formatSourceQuality(source);
  if (source.lastOk == null) return `尚未抓取${quality}`;
  if (source.lastOk) return `成功 ${source.lastFetched ?? 0} 条，新增 ${source.lastInserted ?? 0} 条${quality}`;
  return `失败（${source.lastError ?? "原因未记录"}），下一轮重试${quality}`;
}

function formatFailure(failure: { sourceName: string; error: string }): string {
  return `${failure.sourceName}（${failure.error}）`;
}

function rubberBand(distance: number): number {
  return (1 - Math.exp(-distance / 90)) * 72;
}

/** 正式站壳：首页是信息流，筛选进底栏表单，「我的」「关于」拆成独立页面。 */
export function BoardApp({ initial, view }: { initial: BoardState; view: BoardView }) {
  const [board, setBoard] = useState<BoardState>(() => normalizeBoardState(initial) ?? initial);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState<string | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [showAllLeads, setShowAllLeads] = useState(false);
  const [sort, setSort] = useState<DealSort>("newest");
  const [personal, setPersonal] = useState<Personal>(emptyPersonal);
  const [personalReady, setPersonalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [pollError, setPollError] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [meTab, setMeTab] = useState<MeTab>("favorites");
  const [ptrDy, setPtrDy] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const ptrRef = useRef({ active: false, startY: 0, dy: 0, pointerId: -1 });
  const filtersReady = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setBoard(normalizeBoardState(initial) ?? initial);
  }, [initial]);

  useEffect(() => {
    const fromUrl = hasUrlFilters() ? parseUrlFilters() : null;
    const fromSession = loadSessionFilters();
    const showAll = fromUrl?.showAllLeads ?? fromSession?.showAllLeads ?? loadShowAll();
    const source = fromUrl ?? fromSession ?? {};
    if (typeof source.query === "string") setQuery(source.query);
    if (source.sourceId) setSourceId(source.sourceId);
    if (source.category) setCategory(source.category);
    if (typeof source.onlyNew === "boolean") setOnlyNew(source.onlyNew);
    if (source.sort) setSort(source.sort);
    setShowAllLeads(showAll);
    setPersonal(loadPersonal());
    setPersonalReady(true);
    filtersReady.current = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY && event.key !== SHOW_ALL_KEY) return;
      if (event.key === null || event.key === SHOW_ALL_KEY) setShowAllLeads(loadShowAll());
      if (event.key !== SHOW_ALL_KEY) {
        setPersonal(loadPersonal());
        setPersonalReady(true);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!filtersReady.current) return;
    const next: SessionFilters = { query, sourceId, category, onlyNew, sort, showAllLeads };
    saveSessionFilters(next);
    if (view !== "feed") return;
    const sp = new URLSearchParams();
    if (query.trim()) sp.set("q", query.trim());
    if (sourceId !== "all") sp.set("source", sourceId);
    if (category !== "all") sp.set("cat", category);
    if (onlyNew) sp.set("new", "1");
    if (sort !== "newest") sp.set("sort", sort);
    if (showAllLeads) sp.set("all", "1");
    const qs = sp.toString();
    const nextUrl = qs ? `/?${qs}` : "/";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== nextUrl) window.history.replaceState(null, "", nextUrl);
  }, [query, sourceId, category, onlyNew, sort, showAllLeads, view]);

  useEffect(() => {
    if (initial.lastUpdatedAt && !initial.refreshInProgress) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled || attempts >= 15) return;
      attempts += 1;
      try {
        const response = await fetch("/api/deals", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setPollError(true);
        } else {
          const data: unknown = await response.json().catch(() => null);
          const safe = normalizeBoardState(data);
          if (!safe) {
            if (!cancelled) setPollError(true);
          } else if (!cancelled) {
            setBoard(safe);
            setPollError(false);
            if (safe.lastUpdatedAt && !safe.refreshInProgress) return;
          }
        }
      } catch {
        if (!cancelled) setPollError(true);
      }
      if (!cancelled) timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial]);

  useEffect(() => {
    const dialog = sheetRef.current;
    if (!dialog) return;
    if (filterOpen && !dialog.open) dialog.showModal();
    if (!filterOpen && dialog.open) dialog.close();
  }, [filterOpen]);

  function savePersonal(next: Personal) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError(null);
      setPersonal(next);
    } catch {
      setStorageError("收藏和已领没能写入这台浏览器（可能是隐私模式或存储已满），本次改动只在当前页面有效。");
    }
  }

  function saveShowAll(next: boolean) {
    setShowAllLeads(next);
    try {
      localStorage.setItem(SHOW_ALL_KEY, next ? "1" : "0");
    } catch {
      // 展示偏好写入失败只影响下次打开；当前页面仍按用户选择展示。
    }
  }

  function toggle(list: "claimed" | "favorites", canonicalUrl: string) {
    const latest = loadPersonal();
    const current = new Set(latest[list]);
    if (current.has(canonicalUrl)) current.delete(canonicalUrl);
    else current.add(canonicalUrl);
    savePersonal({ ...latest, [list]: [...current] });
  }

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/refresh", { method: "POST", cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(readError(data) || "刷新没有完成");
        return;
      }
      const safe = normalizeBoardState(data);
      if (!safe) {
        setMessage("刷新结果格式异常，已保留当前列表。");
        return;
      }
      setBoard({ ...safe, refreshInProgress: false });
      setPollError(false);
    } catch {
      setMessage("网络异常，刷新没有完成");
    } finally {
      setRefreshing(false);
      setPtrDy(0);
    }
  }

  function resetFilters() {
    setSourceId("all");
    setCategory("all");
    setQuery("");
    setOnlyNew(false);
    saveShowAll(false);
    setSort("newest");
  }

  function onPtrDown(event: PointerEvent<HTMLDivElement>) {
    if (view !== "feed" || refreshing || board.refreshInProgress) return;
    const main = mainRef.current;
    if (!main || main.scrollTop > 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ptrRef.current = { active: true, startY: event.clientY, dy: 0, pointerId: event.pointerId };
  }

  function onPtrMove(event: PointerEvent<HTMLDivElement>) {
    const state = ptrRef.current;
    if (!state.active || event.pointerId !== state.pointerId) return;
    const main = mainRef.current;
    if (!main) return;
    const raw = event.clientY - state.startY;
    if (raw <= 0 || main.scrollTop > 0) {
      if (state.dy !== 0) setPtrDy(0);
      state.dy = 0;
      return;
    }
    const dy = rubberBand(raw);
    state.dy = dy;
    setPtrDy(dy);
  }

  function onPtrUp(event: PointerEvent<HTMLDivElement>) {
    const state = ptrRef.current;
    if (!state.active || event.pointerId !== state.pointerId) return;
    const shouldRefresh = state.dy >= 52;
    state.active = false;
    state.dy = 0;
    if (shouldRefresh) {
      void refresh();
    } else {
      setPtrDy(0);
    }
  }

  const claimedSet = new Set(personal.claimed);
  const favoriteSet = new Set(personal.favorites);
  const hideOther = !showAllLeads && category === "all";
  const filters = { query, sourceId, category, onlyNew, sort, includeOther: !hideOther };
  const matching = filterDeals(board.deals, { ...filters, includeOther: true }, personal);
  const visible = filterDeals(board.deals, filters, personal);
  const hiddenOtherCount = hideOther ? matching.filter((item) => item.category === "其他").length : 0;
  const waitingForFirst = !board.lastUpdatedAt && (board.refreshInProgress || refreshing);
  const busy = refreshing || board.refreshInProgress;
  const activeFilters = [sourceId !== "all", query.trim().length > 0, onlyNew, sort !== "newest", showAllLeads].filter(Boolean).length;

  const favoriteDeals = personalReady
    ? board.deals.filter((deal) => favoriteSet.has(deal.canonicalUrl))
    : [];
  const claimedDeals = personalReady
    ? board.deals.filter((deal) => claimedSet.has(deal.canonicalUrl))
    : [];

  const statusItems = [
    { label: "更新", value: board.lastUpdatedLabel ? `${board.lastUpdatedLabel} 北京时间` : "尚未更新", testId: "status-update" },
    { label: "来源", value: `${board.sourceHealth.ok}/${board.sourceHealth.total}`, testId: "status-sources" },
    { label: "已收录", value: String(board.activeCount), testId: "status-active" },
    { label: "本轮新增", value: String(board.newCount), testId: "status-new" },
    { label: "下次更新", value: board.nextRefreshLabel ? `${board.nextRefreshLabel} 北京时间` : "尚未排期", testId: "status-next" },
  ];

  const alerts: Alert[] = [];
  if (pollError) alerts.push({ text: "数据暂时不可用，显示的是上次成功读取的内容；恢复后会自动更新。", role: "status", testId: "poll-error" });
  if (storageError) alerts.push({ text: storageError, role: "alert", testId: "storage-error" });
  if (message) alerts.push({ text: message, role: "alert", testId: "refresh-message" });
  if (board.anomalies?.length) alerts.push({ text: `数据提示：${board.anomalies.join("；")}`, role: "status", testId: "anomalies" });
  if (board.failures.length) alerts.push({ text: `未能抓取，下一轮重试：${board.failures.map(formatFailure).join("、")}`, role: "status", testId: "failures" });

  const categoryCounts = new Map<string, number>();
  for (const deal of board.deals) {
    categoryCounts.set(deal.category, (categoryCounts.get(deal.category) ?? 0) + 1);
  }

  const emptyMessage =
    pollError && board.deals.length === 0
      ? "数据暂时不可用，还无法读取条目；恢复后会自动更新，这里不会填入示例优惠。"
      : board.deals.length === 0
        ? board.lastUpdatedAt
          ? "这一轮没有已收录的条目。失败的来源会在下一轮重试，这里不会填入示例优惠。"
          : "服务端还没有完成抓取。空列表是真实状态，不会填入示例优惠。"
        : hiddenOtherCount > 0 && visible.length === 0
          ? "当前条件下只剩已隐藏的「其他」线索；打开筛选里的「查看全部线索」即可查看。"
          : "没有符合当前筛选的条目。";

  const pageTitle = view === "me" ? "我的" : view === "about" ? "关于" : "PerkRadar";

  if (!mounted) {
    return (
      <div className="perk-board pr-app" data-testid="board-root">
        <div className="board-loading pr-loading" role="status" data-testid="loading">
          正在打开…
        </div>
      </div>
    );
  }

  return (
    <div className="perk-board pr-app" data-testid="board-root">
      <div className="pr-body">
        <nav className="pr-sidebar" aria-label="站点导航">
          <Link className="pr-sidebar-brand" href="/">
            <Radar aria-hidden="true" />
            PerkRadar
          </Link>
          <NavLinks view={view} variant="sidebar" />
        </nav>

        <div className="pr-column">
          <header className="pr-header" data-testid="header">
            <div className="pr-header-row">
              <h1 className="pr-title">
                {view === "feed" ? (
                  <Link className="pr-title-link" href="/" data-testid="brand">
                    PerkRadar
                  </Link>
                ) : (
                  pageTitle
                )}
              </h1>
              <button
                type="button"
                className="pr-icon-btn"
                data-testid="refresh"
                onClick={() => void refresh()}
                disabled={busy}
                aria-busy={busy}
                aria-label={busy ? "正在刷新" : "刷新线索"}
              >
                <RefreshCw aria-hidden="true" className={busy ? "pr-spin" : undefined} />
              </button>
              {view === "feed" ? (
                <button
                  type="button"
                  className="pr-icon-btn"
                  data-testid="filter-toggle"
                  aria-expanded={filterOpen}
                  aria-controls="filter-sheet"
                  aria-label={activeFilters ? `打开筛选，已启用 ${activeFilters} 项` : "打开筛选"}
                  onClick={() => setFilterOpen(true)}
                >
                  <SlidersHorizontal aria-hidden="true" />
                  {activeFilters ? <span className="pr-filter-count">{activeFilters}</span> : null}
                </button>
              ) : null}
            </div>

            {view === "feed" ? (
              <>
                <form className="pr-search" role="search" onSubmit={(event) => event.preventDefault()}>
                  <Search aria-hidden="true" />
                  <label className="sr-only" htmlFor="deal-search">
                    搜索标题
                  </label>
                  <input
                    id="deal-search"
                    type="search"
                    enterKeyHint="search"
                    autoCorrect="off"
                    autoCapitalize="none"
                    data-testid="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索工具、软件或关键词"
                  />
                </form>
                <div className="pr-chips" role="tablist" aria-label="分类" data-testid="sidebar">
                  <Chip pressed={category === "all"} testId="category-chip" onClick={() => setCategory("all")}>
                    全部
                  </Chip>
                  {CATEGORIES.map((item) => (
                    <Chip key={item} pressed={category === item} testId="category-chip" onClick={() => setCategory(item)}>
                      {item}
                      <span>{categoryCounts.get(item) ?? 0}</span>
                    </Chip>
                  ))}
                </div>
                <p className="pr-meta-line">
                  {board.lastUpdatedLabel ? `更新于 ${board.lastUpdatedLabel} 北京时间` : "尚未更新"}
                  {board.sourceHealth.total ? ` · 来源 ${board.sourceHealth.ok}/${board.sourceHealth.total}` : null}
                </p>
              </>
            ) : null}

            <div className="pr-alerts" data-testid="alerts" aria-live="polite">
              {alerts.map((alert) => (
                <p key={alert.testId} className="pr-alert" data-tone={alert.role} role={alert.role} data-testid={alert.testId}>
                  {alert.text}
                </p>
              ))}
            </div>
          </header>

          <div
            className="pr-main"
            ref={mainRef}
            data-testid="content"
            onPointerDown={onPtrDown}
            onPointerMove={onPtrMove}
            onPointerUp={onPtrUp}
            onPointerCancel={onPtrUp}
          >
            <div className="pr-ptr" data-visible={ptrDy > 8 || busy ? "true" : "false"} style={{ height: ptrDy > 8 ? Math.max(28, ptrDy) : undefined }} aria-hidden="true">
              <RefreshCw className={busy ? "pr-spin" : undefined} />
              {busy ? "正在刷新" : ptrDy >= 52 ? "松开即可刷新" : "下拉刷新"}
            </div>

            {view === "feed" ? (
              <FeedView
                visible={visible}
                hiddenOtherCount={hiddenOtherCount}
                waitingForFirst={waitingForFirst}
                emptyMessage={emptyMessage}
                personalReady={personalReady}
                claimedSet={claimedSet}
                favoriteSet={favoriteSet}
                onFavorite={(url) => toggle("favorites", url)}
                onReset={resetFilters}
              />
            ) : null}

            {view === "me" ? (
              <MeView
                meTab={meTab}
                onMeTab={setMeTab}
                favoriteDeals={favoriteDeals}
                claimedDeals={claimedDeals}
                personalReady={personalReady}
                claimedSet={claimedSet}
                favoriteSet={favoriteSet}
                onFavorite={(url) => toggle("favorites", url)}
                onClaim={(url) => toggle("claimed", url)}
              />
            ) : null}

            {view === "about" ? (
              <AboutView board={board} statusItems={statusItems} busy={busy} onRefresh={() => void refresh()} />
            ) : null}
          </div>
        </div>
      </div>

      <nav className="pr-tabbar" aria-label="主导航">
        <NavLinks view={view} variant="tabbar" />
      </nav>

      <dialog
        ref={sheetRef}
        id="filter-sheet"
        className="pr-sheet"
        aria-labelledby="filter-sheet-title"
        onClose={() => setFilterOpen(false)}
        onClick={(event) => {
          if (event.target === sheetRef.current) setFilterOpen(false);
        }}
      >
        <div className="pr-sheet-panel" onClick={(event) => event.stopPropagation()}>
          <div className="pr-sheet-handle" />
          <div className="pr-sheet-head">
            <button type="button" className="pr-text-btn" data-testid="reset" onClick={resetFilters}>
              重置
            </button>
            <h2 id="filter-sheet-title">筛选</h2>
            <button type="button" className="pr-text-btn" onClick={() => setFilterOpen(false)}>
              完成
            </button>
          </div>
          <div className="pr-sheet-body">
            <section className="pr-filter-group" aria-label="排序">
              <h3>排序</h3>
              <select className="pr-sort" data-testid="sort" aria-label="排序方式" value={sort} onChange={(event) => setSort(event.target.value as DealSort)}>
                <option value="newest">最新发布</option>
                <option value="expiring">即将到期</option>
              </select>
            </section>
            <section className="pr-filter-group" aria-label="来源筛选">
              <h3>来源</h3>
              <div className="pr-filter-row">
                <Chip pressed={sourceId === "all"} testId="source-chip" onClick={() => setSourceId("all")}>
                  全部来源<span>{board.activeCount}</span>
                </Chip>
                {board.sources.map((source) => (
                  <Chip key={source.id} pressed={sourceId === source.id} testId="source-chip" onClick={() => setSourceId(source.id)}>
                    {source.name}
                    <span>{source.activeCount}</span>
                  </Chip>
                ))}
              </div>
            </section>
            <section className="pr-filter-group" aria-label="更多条件">
              <h3>更多</h3>
              <label className="pr-switch-row">
                只看新增
                <span className="pr-switch">
                  <input type="checkbox" data-testid="only-new" checked={onlyNew} onChange={(event) => setOnlyNew(event.target.checked)} />
                  <i />
                </span>
              </label>
              <label className="pr-switch-row">
                查看全部线索
                <span className="pr-switch">
                  <input type="checkbox" data-testid="show-all" checked={showAllLeads} onChange={(event) => saveShowAll(event.target.checked)} />
                  <i />
                </span>
              </label>
            </section>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function DealBoard({ initial }: { initial: BoardState }) {
  return <BoardApp initial={initial} view="feed" />;
}

function NavLinks({ view, variant }: { view: BoardView; variant: "sidebar" | "tabbar" }) {
  const className = variant === "sidebar" ? "pr-nav-link" : "pr-tab";
  return (
    <>
      <Link className={className} href="/" data-active={view === "feed" ? "true" : "false"} aria-current={view === "feed" ? "page" : undefined}>
        <Newspaper aria-hidden="true" />
        信息
      </Link>
      <Link className={className} href="/me" data-active={view === "me" ? "true" : "false"} aria-current={view === "me" ? "page" : undefined}>
        <User aria-hidden="true" />
        我的
      </Link>
      <Link className={className} href="/about" data-active={view === "about" ? "true" : "false"} aria-current={view === "about" ? "page" : undefined}>
        <Info aria-hidden="true" />
        关于
      </Link>
    </>
  );
}

function Chip({ pressed, onClick, children, testId }: { pressed: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button type="button" className="pr-chip" aria-pressed={pressed} data-testid={testId} onClick={onClick}>
      {children}
    </button>
  );
}

function FeedView({
  visible,
  hiddenOtherCount,
  waitingForFirst,
  emptyMessage,
  personalReady,
  claimedSet,
  favoriteSet,
  onFavorite,
  onReset,
}: {
  visible: DealDTO[];
  hiddenOtherCount: number;
  waitingForFirst: boolean;
  emptyMessage: string;
  personalReady: boolean;
  claimedSet: Set<string>;
  favoriteSet: Set<string>;
  onFavorite: (url: string) => void;
  onReset: () => void;
}) {
  return (
    <>
      <div className="pr-feed-status" data-testid="results-heading">
        <h1>信息</h1>
        <span className="pr-count" role="status" data-testid="visible-count">
          {visible.length} 条线索
        </span>
        {hiddenOtherCount > 0 ? (
          <span className="pr-hidden-note" role="status" data-testid="hidden-note">
            已隐藏 {hiddenOtherCount} 条「其他」线索
          </span>
        ) : null}
      </div>
      {waitingForFirst ? (
        <p className="pr-meta-line" role="status">
          正在进行首次抓取…
        </p>
      ) : null}
      <section className="pr-cards" aria-label="优惠列表" data-testid="cards" data-columns="true">
        {visible.map((deal) => (
          <DealCard
            key={deal.canonicalUrl}
            deal={deal}
            variant="feed"
            claimed={personalReady && claimedSet.has(deal.canonicalUrl)}
            favorite={personalReady && favoriteSet.has(deal.canonicalUrl)}
            onFavorite={() => onFavorite(deal.canonicalUrl)}
          />
        ))}
      </section>
      {visible.length === 0 ? (
        <div className="pr-empty" data-testid="empty-state" role="status">
          <Search aria-hidden="true" />
          <h2>没有可显示的条目</h2>
          <p className="board-empty-note">{emptyMessage}</p>
          <button type="button" className="pr-text-btn" onClick={onReset}>
            清除筛选
          </button>
        </div>
      ) : null}
    </>
  );
}

function MeView({
  meTab,
  onMeTab,
  favoriteDeals,
  claimedDeals,
  personalReady,
  claimedSet,
  favoriteSet,
  onFavorite,
  onClaim,
}: {
  meTab: MeTab;
  onMeTab: (tab: MeTab) => void;
  favoriteDeals: DealDTO[];
  claimedDeals: DealDTO[];
  personalReady: boolean;
  claimedSet: Set<string>;
  favoriteSet: Set<string>;
  onFavorite: (url: string) => void;
  onClaim: (url: string) => void;
}) {
  const list = meTab === "favorites" ? favoriteDeals : claimedDeals;
  return (
    <>
      <div className="pr-me-tabs" role="tablist" aria-label="我的列表">
        <button type="button" className="pr-seg" role="tab" aria-selected={meTab === "favorites"} onClick={() => onMeTab("favorites")}>
          收藏 {personalReady ? favoriteDeals.length : ""}
        </button>
        <button type="button" className="pr-seg" role="tab" aria-selected={meTab === "claimed"} onClick={() => onMeTab("claimed")}>
          已领 {personalReady ? claimedDeals.length : ""}
        </button>
      </div>
      {!personalReady ? (
        <p className="pr-meta-line" role="status">
          正在读取这台浏览器里的收藏。
        </p>
      ) : null}
      <section className="pr-cards" aria-label={meTab === "favorites" ? "收藏列表" : "已领列表"} data-columns="true">
        {list.map((deal) => (
          <DealCard
            key={deal.canonicalUrl}
            deal={deal}
            variant="personal"
            claimed={claimedSet.has(deal.canonicalUrl)}
            favorite={favoriteSet.has(deal.canonicalUrl)}
            onFavorite={() => onFavorite(deal.canonicalUrl)}
            onClaim={() => onClaim(deal.canonicalUrl)}
          />
        ))}
      </section>
      {personalReady && list.length === 0 ? (
        <div className="pr-empty" role="status">
          <Bookmark aria-hidden="true" />
          <h2>{meTab === "favorites" ? "还没有收藏" : "还没有已领记录"}</h2>
          <p>{meTab === "favorites" ? "在信息流里点星标，收藏会保存在这台浏览器中。" : "在这里可以把已领取的线索标记下来，方便以后回看。"}</p>
        </div>
      ) : null}
    </>
  );
}

function AboutView({
  board,
  statusItems,
  busy,
  onRefresh,
}: {
  board: BoardState;
  statusItems: { label: string; value: string; testId: string }[];
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="pr-about">
      <section className="pr-panel board-status" aria-label="运行状态">
        <h2>运行状态</h2>
        <dl className="pr-status-list board-status-list" data-testid="stats">
          {statusItems.map((item) => (
            <div className="pr-status-item board-status-item" key={item.label} data-testid={item.testId}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="pr-refresh-btn" onClick={onRefresh} disabled={busy} aria-busy={busy}>
          <RefreshCw aria-hidden="true" className={busy ? "pr-spin" : undefined} />
          {busy ? "刷新中" : "立即刷新"}
        </button>
      </section>

      <section className="pr-panel board-source-results" data-testid="source-results">
        <h2>各来源本轮结果</h2>
        <ul className="pr-source-list">
          {board.sources.map((source) => (
            <li key={source.id}>
              <strong>{source.name}</strong>
              {formatSourceOutcome(source)}
            </li>
          ))}
        </ul>
      </section>

      <section className="pr-panel board-lead-note" data-testid="lead-note">
        <h2>说明</h2>
        <p>
          <span className="sr-only">公开订阅源线索，未核实是否仍可领取。</span>
          只表示抓到了这条线索；未核实活动是否仍有效、领取条件或能否领取。全部内容来自公开订阅源，不是逐条认证的领取清单。
        </p>
      </section>

      <section className="pr-panel" data-testid="footer">
        <h2>保留规则</h2>
        <p data-testid="footer-note">默认隐藏分类为「其他」的线索；在筛选中打开「查看全部线索」可查看本轮抓到的全部条目。</p>
        <p>没有到期时间的条目，从发布时刻起保留 7 天；正好满 7 天仍保留，再早 1 毫秒淘汰。有到期时间的，到点即下架。</p>
        <p>本轮新增只包含最近一轮成功写入的新链接。某一来源失败时，不会改写它已经抓到的标题和时间。</p>
      </section>
    </div>
  );
}

function DealCard({
  deal,
  claimed,
  favorite,
  onClaim,
  onFavorite,
  variant,
}: {
  deal: DealDTO;
  claimed: boolean;
  favorite: boolean;
  onClaim?: () => void;
  onFavorite: () => void;
  variant: "feed" | "personal";
}) {
  return (
    <article className="pr-card demo-deal" data-claimed={claimed ? "true" : "false"} data-new={deal.isNew ? "true" : "false"} data-testid="deal-card" aria-label={deal.title}>
      <div className="pr-card-top deal-heading">
        <h2 data-testid="deal-title">{deal.title}</h2>
        <button
          type="button"
          className="pr-favorite demo-favorite"
          data-testid="favorite"
          aria-label={`${favorite ? "取消收藏" : "收藏"}：${deal.title}`}
          aria-pressed={favorite}
          onClick={onFavorite}
        >
          <Bookmark aria-hidden="true" />
          <span className="sr-only">{favorite ? "已收藏" : "收藏"}</span>
        </button>
      </div>
      <div className="pr-card-meta" data-testid="deal-meta">
        <b data-testid="deal-source">{deal.sourceName}</b>
        {deal.expiresLabel ? (
          <span data-testid="deal-expiry">
            {deal.expiresSoon ? "临期" : "到期"} {deal.expiresLabel}
          </span>
        ) : deal.publishedLabel ? (
          <span>发布 {deal.publishedLabel}</span>
        ) : null}
        <span data-testid="deal-category">{deal.category}</span>
        {deal.isNew ? (
          <span className="pr-pill-new deal-fresh" data-testid="deal-new">
            本轮新增
          </span>
        ) : null}
        {deal.expiresSoon ? <span className="pr-pill-soon">即将到期</span> : null}
        {claimed ? (
          <span className="pr-pill-claimed deal-claimed-state" data-testid="deal-claimed">
            已领
          </span>
        ) : null}
      </div>
      {variant === "personal" && deal.summary ? (
        <p className="pr-meta-line" data-testid="deal-summary">
          {deal.summary}
        </p>
      ) : (
        <span className="sr-only" data-testid="deal-summary">
          {deal.summary || "原文没有提供摘要。"}
        </span>
      )}
      <div className="pr-card-actions deal-actions">
        <a className="pr-card-link" href={deal.url} target="_blank" rel="noopener noreferrer" data-testid="open-original">
          打开原文
          <ArrowUpRight aria-hidden="true" />
        </a>
        {variant === "personal" && onClaim ? (
          <button type="button" className="pr-text-btn" data-testid="claim" aria-pressed={claimed} onClick={onClaim}>
            <Check aria-hidden="true" />
            {claimed ? "撤销已领" : "标记已领"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
