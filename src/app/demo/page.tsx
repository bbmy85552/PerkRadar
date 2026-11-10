"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Info,
  Newspaper,
  Radar,
  Search,
  SlidersHorizontal,
  User,
} from "lucide-react";
import "../../components/deal-board.css";

// 仅用于界面预览：不读取接口，不写入数据库或浏览器存储。
const deals = [
  { id: 1, title: "开发者工具限时体验", description: "代码编辑、部署与协作工具体验线索，适合寻找下一款开发工具。具体资格与使用限制需查看原文。", source: "LINUX DO", category: "开发工具", fresh: true, expires: "11-18" },
  { id: 2, title: "本周游戏发现：独立游戏与周末试玩", description: "独立游戏与周末试玩合集，方便集中浏览感兴趣的作品。试玩范围与开放时间需以原文为准。", source: "Epic", category: "游戏娱乐", fresh: true, expires: "11-16" },
  { id: 3, title: "轻量云服务器资源优惠线索", description: "面向个人博客、实验项目与小型服务的云资源信息。配置、地区与续费价格需进一步确认。", source: "NodeSeek", category: "云与主机", fresh: true, expires: null },
  { id: 4, title: "效率应用清单：窗口管理与笔记整理", description: "收集窗口管理、笔记整理等日常效率工具，便于比较使用场景。支持平台与授权方式需查看原文。", source: "小众软件", category: "软件应用", fresh: false, expires: null },
  { id: 5, title: "开源工具箱：日常开发实用项目", description: "社区分享的开发工具与开源项目，涵盖常见的日常工作需求。功能说明与开源许可需以项目原文为准。", source: "V2EX", category: "开发工具", fresh: false, expires: null },
  { id: 6, title: "桌面工具推荐：文件整理、阅读与知识管理", description: "桌面应用体验线索，覆盖文件整理、阅读与个人知识管理。是否免费及适用系统需查看原文说明。", source: "异次元", category: "软件应用", fresh: false, expires: "11-30" },
  { id: 7, title: "闲聊：最近大家在用什么桌面小工具", description: "综合源里的普通讨论，仅用于演示「其他」默认隐藏；不代表优惠线索。", source: "NodeSeek", category: "其他", fresh: false, expires: null },
];
const sources = ["全部来源", "LINUX DO", "V2EX", "Epic", "NodeSeek", "小众软件", "果核剥壳", "异次元"];
const categories = ["全部", "开发工具", "游戏娱乐", "云与主机", "软件应用", "其他"];
type Deal = (typeof deals)[number];
type View = "feed" | "me" | "about";

/** 纯视觉演示：筛选、收藏与标记只存在于当前页面内存。 */
export default function DemoPage() {
  const [view, setView] = useState<View>("feed");
  const [source, setSource] = useState("全部来源");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<"newest" | "expiring">("newest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [claimed, setClaimed] = useState<number[]>([]);
  const [meTab, setMeTab] = useState<"favorites" | "claimed">("favorites");

  useEffect(() => setMounted(true), []);
  const term = query.trim().toLowerCase();
  const hideOther = !showAll && category === "全部";
  const matching = deals.filter((deal) =>
    (source === "全部来源" || source === deal.source) &&
    (category === "全部" || category === deal.category) &&
    (!newOnly || deal.fresh) &&
    `${deal.title} ${deal.description} ${deal.source} ${deal.category}`.toLowerCase().includes(term),
  );
  const visible = matching.filter((deal) => !hideOther || deal.category !== "其他");
  const hiddenOtherCount = hideOther ? matching.filter((deal) => deal.category === "其他").length : 0;
  const activeFilters = [source !== "全部来源", term.length > 0, newOnly, sort !== "newest", showAll].filter(Boolean).length;
  const favoriteDeals = deals.filter((deal) => favorites.includes(deal.id));
  const claimedDeals = deals.filter((deal) => claimed.includes(deal.id));

  function resetFilters() {
    setSource("全部来源");
    setCategory("全部");
    setQuery("");
    setNewOnly(false);
    setShowAll(false);
    setSort("newest");
  }
  function toggleFavorite(id: number) {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function toggleClaimed(id: number) {
    setClaimed((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  if (!mounted) return <div className="perk-board pr-app"><div className="board-loading">正在打开示例…</div></div>;

  const list = view === "me" ? (meTab === "favorites" ? favoriteDeals : claimedDeals) : visible;

  return (
    <div className="perk-board pr-app">
      <div className="pr-body">
        <nav className="pr-sidebar" aria-label="站点导航">
          <Link className="pr-sidebar-brand" href="/demo"><Radar aria-hidden="true" />PerkRadar</Link>
          <DemoNav view={view} onView={setView} variant="sidebar" />
          <p className="pr-meta-line" style={{ margin: "16px 8px 0" }}>演示页 · 非真实优惠</p>
        </nav>
        <div className="pr-column">
          <header className="pr-header">
            <div className="pr-header-row">
              <h1 className="pr-title">{view === "feed" ? "PerkRadar" : view === "me" ? "我的" : "关于"}</h1>
              <a className="pr-icon-btn" href="/" aria-label="返回正式站" title="返回正式站">
                <ArrowUpRight aria-hidden="true" />
              </a>
              {view === "feed" ? (
                <button type="button" className="pr-icon-btn" aria-label="打开筛选" aria-expanded={filterOpen} onClick={() => setFilterOpen(true)}>
                  <SlidersHorizontal aria-hidden="true" />
                  {activeFilters ? <span className="pr-filter-count">{activeFilters}</span> : null}
                </button>
              ) : null}
            </div>
            {view === "feed" ? (
              <>
                <form className="pr-search" role="search" onSubmit={(event) => event.preventDefault()}>
                  <Search aria-hidden="true" />
                  <label className="sr-only" htmlFor="demo-search">搜索示例线索</label>
                  <input id="demo-search" type="search" placeholder="搜索工具、软件或关键词" value={query} onChange={(event) => setQuery(event.target.value)} />
                </form>
                <div className="pr-chips" aria-label="分类">
                  {categories.map((name) => (
                    <button key={name} type="button" className="pr-chip" aria-pressed={category === name} onClick={() => setCategory(name)}>
                      {name}
                    </button>
                  ))}
                </div>
                <p className="pr-meta-line">演示数据 · 7 条示例</p>
              </>
            ) : null}
          </header>
          <div className="pr-main">
            {view === "feed" ? (
              <>
                <div className="pr-feed-status">
                  <h1>信息</h1>
                  <span role="status" data-testid="visible-count">{visible.length} 条示例</span>
                  {hiddenOtherCount > 0 ? <span className="pr-hidden-note" role="status" data-testid="hidden-note">已隐藏 {hiddenOtherCount} 条「其他」示例</span> : null}
                </div>
                <section className="pr-cards" data-columns="true">
                  {visible.map((deal) => (
                    <DemoCard key={deal.id} deal={deal} favorite={favorites.includes(deal.id)} claimed={claimed.includes(deal.id)} variant="feed" onFavorite={() => toggleFavorite(deal.id)} />
                  ))}
                </section>
                {visible.length === 0 ? (
                  <div className="pr-empty">
                    <Search aria-hidden="true" />
                    <h2>没有匹配的示例</h2>
                    <p>{hiddenOtherCount > 0 ? "当前条件下只剩已隐藏的「其他」示例，打开「查看全部线索」即可查看。" : "试试其他关键词，或清除来源和分类筛选。"}</p>
                    <button type="button" className="pr-text-btn" onClick={resetFilters}>清除筛选</button>
                  </div>
                ) : null}
              </>
            ) : null}
            {view === "me" ? (
              <>
                <div className="pr-me-tabs" role="tablist">
                  <button type="button" className="pr-seg" aria-selected={meTab === "favorites"} onClick={() => setMeTab("favorites")}>收藏 {favoriteDeals.length}</button>
                  <button type="button" className="pr-seg" aria-selected={meTab === "claimed"} onClick={() => setMeTab("claimed")}>已领 {claimedDeals.length}</button>
                </div>
                <section className="pr-cards" data-columns="true">
                  {list.map((deal) => (
                    <DemoCard key={deal.id} deal={deal} favorite={favorites.includes(deal.id)} claimed={claimed.includes(deal.id)} variant="personal" onFavorite={() => toggleFavorite(deal.id)} onClaim={() => toggleClaimed(deal.id)} />
                  ))}
                </section>
                {list.length === 0 ? (
                  <div className="pr-empty">
                    <Bookmark aria-hidden="true" />
                    <h2>{meTab === "favorites" ? "还没有收藏" : "还没有已领记录"}</h2>
                    <p>演示标记只存在于当前页面，刷新后会重置。</p>
                  </div>
                ) : null}
              </>
            ) : null}
            {view === "about" ? (
              <div className="pr-about">
                <section className="pr-panel">
                  <h2>说明</h2>
                  <p>这是界面演示，全部为示例内容，非真实优惠，也没有原文链接。正式页面会在这里展示来源健康、最近刷新和保留规则。</p>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <nav className="pr-tabbar" aria-label="主导航">
        <DemoNav view={view} onView={setView} variant="tabbar" />
      </nav>
      {filterOpen ? (
        <div className="pr-sheet" role="dialog" aria-modal="true" aria-labelledby="demo-filter-title" style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.32)", zIndex: 40 }} onClick={() => setFilterOpen(false)}>
          <div className="pr-sheet-panel" onClick={(event) => event.stopPropagation()}>
            <div className="pr-sheet-handle" />
            <div className="pr-sheet-head">
              <button type="button" className="pr-text-btn" onClick={resetFilters}>重置</button>
              <h2 id="demo-filter-title">筛选</h2>
              <button type="button" className="pr-text-btn" onClick={() => setFilterOpen(false)}>完成</button>
            </div>
            <div className="pr-sheet-body">
              <section className="pr-filter-group">
                <h3>排序</h3>
                <select className="pr-sort" value={sort} onChange={(event) => setSort(event.target.value as "newest" | "expiring")}>
                  <option value="newest">最新发布</option>
                  <option value="expiring">即将到期</option>
                </select>
              </section>
              <section className="pr-filter-group">
                <h3>来源</h3>
                <div className="pr-filter-row">
                  {sources.map((name) => (
                    <button key={name} type="button" className="pr-chip" aria-pressed={source === name} onClick={() => setSource(name)}>
                      {name}
                      <span>{name === "全部来源" ? deals.length : deals.filter((deal) => deal.source === name).length}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="pr-filter-group">
                <h3>更多</h3>
                <label className="pr-switch-row">只看新增<span className="pr-switch"><input type="checkbox" checked={newOnly} onChange={(event) => setNewOnly(event.target.checked)} /><i /></span></label>
                <label className="pr-switch-row">查看全部线索<span className="pr-switch"><input type="checkbox" data-testid="show-all" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /><i /></span></label>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DemoNav({ view, onView, variant }: { view: View; onView: (view: View) => void; variant: "sidebar" | "tabbar" }) {
  const className = variant === "sidebar" ? "pr-nav-link" : "pr-tab";
  const items = [
    { id: "feed" as const, label: "信息", icon: Newspaper },
    { id: "me" as const, label: "我的", icon: User },
    { id: "about" as const, label: "关于", icon: Info },
  ];
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} type="button" className={className} data-active={view === item.id ? "true" : "false"} onClick={() => onView(item.id)}>
            <Icon aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </>
  );
}

function DemoCard({ deal, favorite, claimed, variant, onFavorite, onClaim }: { deal: Deal; favorite: boolean; claimed: boolean; variant: "feed" | "personal"; onFavorite: () => void; onClaim?: () => void }) {
  return (
    <article className="pr-card" data-claimed={claimed}>
      <div className="pr-card-top">
        <h2>{deal.title}</h2>
        <button type="button" className="pr-favorite" aria-label={`${favorite ? "取消收藏" : "收藏"}：${deal.title}`} aria-pressed={favorite} onClick={onFavorite}>
          <Bookmark aria-hidden="true" />
        </button>
      </div>
      <div className="pr-card-meta">
        <b>{deal.source}</b>
        {deal.expires ? <span>到期 {deal.expires}</span> : null}
        <span>{deal.category}</span>
        {deal.fresh ? <span className="pr-pill-new">本轮新增</span> : null}
        {claimed ? <span className="pr-pill-claimed">已领</span> : null}
      </div>
      {variant === "personal" ? <p className="pr-meta-line">{deal.description}</p> : null}
      <div className="pr-card-actions">
        <button type="button" className="pr-card-link">打开原文<ArrowUpRight aria-hidden="true" /></button>
        {variant === "personal" && onClaim ? (
          <button type="button" className="pr-text-btn" aria-pressed={claimed} onClick={onClaim}>
            <Check aria-hidden="true" />{claimed ? "撤销已领" : "标记已领"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
