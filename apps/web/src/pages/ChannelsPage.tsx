import { useEffect, useState, type FormEvent } from "react";
import { api, type Channel } from "../api";

export function ChannelsPage() {
  const [items, setItems] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"telegram" | "bark">("telegram");
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await api.channels();
    setItems(res.items);
  }

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const config =
        type === "telegram"
          ? { botToken, chatId }
          : { deviceKey, ...(baseUrl ? { baseUrl } : {}) };
      await api.createChannel({ name, type, config, enabled: true });
      setName("");
      setBotToken("");
      setChatId("");
      setDeviceKey("");
      setBaseUrl("");
      await refresh();
      setMsg("渠道已创建");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>通知渠道</h1>
          <p>MVP 支持 Telegram Bot 与 Bark。Token / Key 不会完整回显。</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      <div className="panel" style={{ marginBottom: 16 }}>
        <form className="form" onSubmit={onCreate}>
          <label>
            名称
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            类型
            <select value={type} onChange={(e) => setType(e.target.value as "telegram" | "bark")}>
              <option value="telegram">Telegram</option>
              <option value="bark">Bark</option>
            </select>
          </label>
          {type === "telegram" ? (
            <>
              <label>
                Bot Token
                <input value={botToken} onChange={(e) => setBotToken(e.target.value)} />
              </label>
              <label>
                Chat ID
                <input value={chatId} onChange={(e) => setChatId(e.target.value)} required />
              </label>
            </>
          ) : (
            <>
              <label>
                Device Key
                <input value={deviceKey} onChange={(e) => setDeviceKey(e.target.value)} required />
              </label>
              <label>
                自建 Base URL（可选）
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.day.app"
                />
              </label>
            </>
          )}
          <div>
            <button className="btn" type="submit">
              添加渠道
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>配置</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ch) => (
              <tr key={ch.id}>
                <td>{ch.name}</td>
                <td>{ch.type}</td>
                <td className="muted">
                  {Object.entries(ch.config)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(", ")}
                </td>
                <td>
                  <div className="btn-row">
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={async () => {
                        try {
                          const r = await api.testChannel(ch.id);
                          setMsg(r.ok ? `测试成功：${ch.name}` : `测试失败：${r.error}`);
                        } catch (err) {
                          setMsg(err instanceof Error ? err.message : String(err));
                        }
                      }}
                    >
                      发送测试
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={async () => {
                        if (!confirm("确认删除该渠道？")) return;
                        await api.deleteChannel(ch.id);
                        await refresh();
                      }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
