import { useEffect, useState } from "react";
import { api, type Listing } from "../api";
import { formatPrice, formatTime, platformName } from "../lib/format";

export function ListingsPage() {
  const [items, setItems] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [platform, setPlatform] = useState("");
  const [keyword, setKeyword] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const qs = new URLSearchParams();
    if (platform) qs.set("platform", platform);
    if (keyword) qs.set("keyword", keyword);
    if (priceMin) qs.set("priceMin", priceMin);
    if (priceMax) qs.set("priceMax", priceMax);
    const res = await api.listings(qs.toString());
    setItems(res.items);
    setTotal(res.total);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>商品列表</h1>
          <p>统一商品库，可按平台、关键词、价格筛选。共 {total} 条。</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="filters">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">全部平台</option>
          <option value="demo">Demo</option>
          <option value="mercari">メルカリ</option>
          <option value="rakuma">ラクマ</option>
          <option value="yahoo_fleamarket">Yahoo!フリマ</option>
          <option value="yahoo_auctions">ヤフオク!</option>
        </select>
        <input
          placeholder="关键词"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <input
          placeholder="最低价"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
        />
        <input
          placeholder="最高价"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
        />
        <button className="btn" type="button" onClick={() => load().catch((e) => setError(e.message))}>
          筛选
        </button>
      </div>

      <div className="listing-grid">
        {items.map((item) => (
          <article key={item.id} className="listing-item">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.title ?? ""} />
            ) : (
              <div style={{ aspectRatio: 1, background: "#e8efe9" }} />
            )}
            <div className="body">
              <div className="muted">{platformName(item.platform)}</div>
              <strong>{item.title ?? "（无标题）"}</strong>
              <div>{formatPrice(item.price, item.currency)}</div>
              <div className="muted">卖家：{item.seller ?? "—"}</div>
              <div className="muted">发现：{formatTime(item.discoveredAt)}</div>
              <a className="btn secondary" href={item.url} target="_blank" rel="noreferrer">
                打开原链接
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
