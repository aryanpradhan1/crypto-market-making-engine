import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./theme.css";

const coins = [
  { symbol: "BTC", size: "5.0000" },
  { symbol: "ETH", size: "0.0000" },
  { symbol: "SOL", size: "0.0000" },
  { symbol: "XRP", size: "0.0000" },
  { symbol: "BNB", size: "0.0000" },
  { symbol: "ADA", size: "0.0000" },
  { symbol: "DOGE", size: "0.0000" },
  { symbol: "TON", size: "0.0000" },
  { symbol: "AVAX", size: "0.0000" },
  { symbol: "LINK", size: "0.0000" },
  { symbol: "DOT", size: "0.0000" },
  { symbol: "LTC", size: "0.0000" },
  { symbol: "BCH", size: "0.0000" },
  { symbol: "SHIB", size: "0.0000" },
  { symbol: "XLM", size: "0.0000" },
  { symbol: "SUI", size: "0.0000" },
  { symbol: "HBAR", size: "0.0000" },
  { symbol: "NEAR", size: "0.0000" },
  { symbol: "UNI", size: "0.0000" },
];
const markets = Object.fromEntries(coins.map(({ symbol, size }) => [
  `${symbol} / USD`,
  { symbol, inventory: "0.0000", size },
]));
const watchlist = coins.slice(0, 8);
const money = (value) => Number.isFinite(value)
  ? `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 8 : 2,
  })}`
  : "—";

function Icon({ name }) {
  const paths = {
    overview: <><rect x="3" y="3" width="5" height="6" rx="1"/><rect x="12" y="3" width="5" height="3" rx="1"/><rect x="12" y="9" width="5" height="8" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/></>,
    strategy: <><path d="M3 14.5 7.2 10l3 2.8L17 5"/><path d="M12.5 5H17v4.5"/></>,
    orders: <><path d="M5 4.5h10M5 8.5h10M5 12.5h6"/><rect x="3" y="2.5" width="14" height="15" rx="2"/></>,
  };
  return <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">{paths[name]}</svg>;
}

function MetricCard({ label, value, detail, change, icon, tone, children }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-foot">{change && <strong className={change.startsWith("↓") || change.startsWith("↗") || change.startsWith("+") ? "positive" : ""}>{change}</strong>}<span>{detail}</span><small>{children}</small></div>
  </article>;
}

function MarketChart({ prices }) {
  const { line, area, last, low, high } = useMemo(() => {
    if (!prices.length) return { line: "", area: "", last: null, low: 0, high: 0 };
    const values = prices.map(({ price }) => price);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = (high - low) * 0.15 || high * 0.001;
    const min = low - padding;
    const max = high + padding;
    const points = prices.map(({ price }, index) => [
      index * (800 / Math.max(prices.length - 1, 1)),
      200 - ((price - min) / (max - min)) * 170,
    ]);
    const path = points.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    return {
      line: path,
      area: `${path} L 800 220 L 0 220 Z`,
      last: points.at(-1),
      low: min,
      high: max,
    };
  }, [prices]);
  return <div className="chart-wrap">
    <div className="y-labels">{last ? [high, (high + low) / 2, low].map((value) => <span key={value}>{money(value)}</span>) : <span>Waiting for live trades</span>}</div>
    <svg className="market-chart" viewBox="0 0 800 220" preserveAspectRatio="none" role="img" aria-label="Live Coinbase trade price chart">
      <defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3478c3" stopOpacity=".2"/><stop offset="100%" stopColor="#3478c3" stopOpacity="0"/></linearGradient></defs>
      {[30, 75, 120, 165, 210].map((y) => <line key={y} className="grid-line" x1="0" y1={y} x2="800" y2={y}/>)}
      {last && <><path className="area" d={area}/><line className="last-line" x1="0" y1={last[1]} x2="800" y2={last[1]}/><path className="price-line" d={line}/><circle className="chart-point" cx={last[0]} cy={last[1]} r="4"/></>}
    </svg>
    {prices.length > 0 && <div className="chart-tooltip"><strong>{money(prices.at(-1).price)}</strong><span>{new Date(prices.at(-1).time).toLocaleTimeString()}</span></div>}
    <div className="x-labels"><span>First live trade</span><span>Now</span></div>
  </div>;
}

function App() {
  const [pair, setPair] = useState("BTC / USD");
  const [running, setRunning] = useState(true);
  const [apiRefresh, setApiRefresh] = useState(0);
  const [apiStatus, setApiStatus] = useState("loading");
  const [apiError, setApiError] = useState("");
  const [priceUpdatedAt, setPriceUpdatedAt] = useState(null);
  const [priceHistory, setPriceHistory] = useState({});
  const [marketPrices, setMarketPrices] = useState({});
  const [page, setPage] = useState("Overview");
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState("");
  const baseMarket = markets[pair];
  const market = { ...baseMarket, ...marketPrices[baseMarket.symbol] };
  const spread = market.price ? market.price * 0.000934 : null;

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    const socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    const productSymbols = Object.fromEntries(coins.map(({ symbol }) => [`${symbol}-USD`, symbol]));

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "subscribe",
        product_ids: Object.keys(productSymbols),
        channels: ["ticker"],
      }));
    };

    socket.onmessage = (event) => {
      const ticker = JSON.parse(event.data);
      const symbol = productSymbols[ticker.product_id];
      const price = Number(ticker.price);
      if (ticker.type !== "ticker" || !symbol || !Number.isFinite(price)) return;

      const open = Number(ticker.open_24h);
      setMarketPrices((current) => ({
        ...current,
        [symbol]: {
          price,
          change: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : current[symbol].change,
        },
      }));
      setPriceHistory((current) => ({
        ...current,
        [symbol]: [...(current[symbol] || []), { price, time: Date.now() }].slice(-100),
      }));
      setPriceUpdatedAt(new Date());
      setApiError("");
      setApiStatus("connected");
    };

    socket.onerror = () => {
      setApiStatus("error");
      setApiError("Couldn't connect to Coinbase live prices.");
      socket.close();
    };

    socket.onclose = () => {
      if (cancelled) return;
      setApiStatus("loading");
      setApiError("Live feed disconnected. Reconnecting…");
      retryTimer = setTimeout(() => setApiRefresh((count) => count + 1), 5000);
    };

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      socket.close();
    };
  }, [apiRefresh]);

  useEffect(() => {
    const tick = () => setClock(`${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date())} UTC`);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectPage = (view) => {
    setPage(view);
    if (view === "Orders") document.querySelector("#orders")?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (view === "Overview") { window.scrollTo({ top: 0, behavior: "smooth" }); setToast("You’re viewing the strategy overview."); }
    else setToast("Adjust the strategy from the live quotes panel.");
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="workspace-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        {[["Overview", "overview"], ["Strategy", "strategy"], ["Orders", "orders"]].map(([name, icon]) =>
          <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => selectPage(name)}><Icon name={icon}/>{name}{name === "Orders" && <span className="nav-count">4</span>}</button>)}
      </nav>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><i>/</i><strong>{page}</strong></div><div className="topbar-right"><span className="clock">{clock}</span></div></header>
      <div className="dashboard">
        <section className="page-heading">
          <div><h1>Market overview</h1><p className="page-subtitle">Live cryptocurrency prices and market activity.</p></div>
          <div className="heading-actions"><label className="pair-select-wrap"><span className="sr-only">Select market pair</span><select value={pair} onChange={(event) => setPair(event.target.value)}>{Object.keys(markets).map((name) => <option key={name}>{name}</option>)}</select><span className="select-chevron">⌄</span></label><button className={`run-button ${!running ? "paused" : ""}`} onClick={() => { setRunning(!running); setToast(running ? "Strategy paused. Existing demo orders are unchanged." : "Strategy resumed in demo mode."); }}><span>{running ? "Ⅱ" : "▶"}</span>{running ? "Pause engine" : "Resume engine"}</button></div>
        </section>

        <section className="crypto-watchlist" aria-label="Popular cryptocurrencies">
          <div className="watchlist-heading"><h2>Popular markets</h2><span>{apiStatus === "connected" ? "Live trade prices" : apiStatus === "error" ? "Reconnecting to live feed" : "Connecting to live feed"}</span></div>
          <div className="watchlist-items">
            {watchlist.map(({ symbol }) => {
              const quote = marketPrices[symbol];
              return <button key={symbol} className={`watchlist-item ${market.symbol === symbol ? "selected" : ""}`} onClick={() => setPair(`${symbol} / USD`)}>
                <span className="watchlist-symbol">{symbol}<small>/ USD</small></span>
                <strong>{money(quote?.price)}</strong>
                <span className={quote ? quote.change < 0 ? "negative" : "positive" : "waiting-price"}>
                  {quote ? `${quote.change > 0 ? "+" : ""}${quote.change.toFixed(2)}%` : "Waiting for trade"}
                </span>
              </button>;
            })}
          </div>
          <p className="watchlist-hint">Choose a coin to view its market details · more coins in the market selector</p>
        </section>

        <section className="metric-grid" aria-label="Strategy performance">
          <MetricCard label="Portfolio value" value="$0.00" change="0.00%" detail="no holdings" icon="$" tone="violet">24H<Sparkline tone="violet"/></MetricCard>
          <MetricCard label="Inventory" value={<>{market.inventory} <span className="unit">{market.symbol}</span></>} change="0%" detail="of max position" icon="◈" tone="blue">MAX 0.82<InventoryBar/></MetricCard>
        </section>

        <section className="content-grid">
          <article className="panel chart-panel">
            <div className="panel-heading"><div><h2>Market overview</h2><p>Live trades &amp; strategy P&amp;L</p></div><div className="chart-controls"><span className="live-tag"><i/>LIVE TICKER</span><button className="icon-button expand-button" aria-label="Chart options" onClick={() => setToast("Chart is shown at its current dashboard size.")}>↗</button></div></div>
            <div className="chart-legend"><span><i className="legend-dot price-dot"/>Live spot price <strong>{money(market.price)}</strong></span><span><i className="legend-dot pnl-dot"/>Strategy P&amp;L <strong>$0.00</strong></span></div>
            <MarketChart prices={priceHistory[market.symbol] || []}/>
            <div className="chart-footer"><span><i className={`status-dot ${apiStatus === "error" ? "status-error" : ""}`}/>{apiStatus === "error" ? apiError : apiStatus === "connected" ? "Live Coinbase trade feed" : "Connecting to Coinbase trade feed…"}</span><span>{priceUpdatedAt ? `Last trade ${priceUpdatedAt.toLocaleTimeString()}` : "Waiting for first trade"}</span></div>
          </article>

          <article className="panel quote-panel">
            <div className="panel-heading"><div><h2>Market quotes</h2><p>Avellaneda–Stoikov model</p></div><span className="live-tag"><i/>{apiStatus === "connected" ? "LIVE" : apiStatus === "loading" ? "CONNECTING" : "OFFLINE"}</span></div>
            <div className="quote-market"><div><span className="quote-label">LIVE MID PRICE</span><strong>{money(market.price)}</strong></div><span className={`market-change ${market.change === undefined ? "waiting-price" : market.change >= 0 ? "positive" : "negative"}`}>{market.change === undefined ? "Waiting for trade" : `${market.change >= 0 ? "+" : ""}${market.change.toFixed(2)}%`}</span></div>
            <div className="quote-cards"><div className="quote-side bid-side"><span className="quote-label"><i/> YOUR BID</span><strong>{money(market.price - spread / 2)}</strong><small>{market.size} {market.symbol} <i>·</i> Maker</small></div><div className="quote-side ask-side"><span className="quote-label"><i/> YOUR ASK</span><strong>{money(market.price + spread / 2)}</strong><small>{market.size} {market.symbol} <i>·</i> Maker</small></div></div>
            <div className="spread-row"><span>Quoted spread</span><strong>{money(spread)} <i>(9.3 bps)</i></strong></div><div className="quote-divider"/>
            <div className="model-heading"><span>MARKET DETAILS</span></div>
            <div className="parameter-row"><span>Market</span><strong>{market.symbol} / USD</strong></div><div className="parameter-row"><span>Feed</span><strong>Coinbase live</strong></div><div className="parameter-row"><span>Inventory</span><strong>{market.inventory}</strong></div>
            <div className="inventory-bias"><span>↘</span>Inventory skew<strong>0.0 bps</strong></div>
          </article>
        </section>

        <section className="bottom-grid">
          <article className="panel orders-panel" id="orders">
            <div className="panel-heading"><div className="heading-with-count"><h2>Open orders</h2><span className="count-badge">0</span></div></div>
            <div className="table-wrap"><table><thead><tr><th>Side</th><th>Price</th><th>Amount</th><th>Filled</th><th>Status</th></tr></thead><tbody>
              <tr><td colSpan="5" className="empty-orders">No open orders</td></tr>
            </tbody></table></div>
          </article>
        </section>
        <footer className="page-footer"><span>Strategy simulation <i>·</i> No real orders are placed</span><span>Not financial advice</span></footer>
      </div>
    </main>

    <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">{toast}</div>
  </div>;
}

function Sparkline({ tone }) {
  const path = tone === "violet" ? "M0 26 C12 23 13 16 23 19 S39 26 49 15 63 14 70 18 82 8 91 12 105 5 120 2" : "M0 28 C9 27 12 18 22 23 S37 26 42 18 51 19 58 13 68 17 77 11 88 16 94 8 108 10 120 3";
  return <span className={`sparkline ${tone}`}><svg viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true"><path d={path}/></svg></span>;
}
function InventoryBar() { return <span className="inventory-track"><i/></span>; }
createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
