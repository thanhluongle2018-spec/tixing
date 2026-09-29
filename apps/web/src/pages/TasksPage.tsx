import { useEffect, useState, type FormEvent } from "react";
import { api, type Channel, type PlatformStatus, type Task } from "../api";
import { formatTime, intervalLabel, platformName } from "../lib/format";

const INTERVALS = [
  { value: 60, label: "1 分钟" },
  { value: 300, label: "5 分钟" },
  { value: 600, label: "10 分钟" },
  { value: 1800, label: "30 分钟" },
];

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["demo"]);
  const [intervalSeconds, setIntervalSeconds] = useState(300);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("");
  const [seller, setSeller] = useState("");
  const [channelIds, setChannelIds] = useState<string[]>([]);

  async function refresh() {
    const [t, p, c] = await Promise.all([api.tasks(), api.platforms(), api.channels()]);
    setTasks(t.items);
    setPlatforms(p.items.filter((x) => x.selectableInMvp));
    setChannels(c.items);
  }

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
  }, []);

  function resetForm(task?: Task | null) {
    setEditing(task ?? null);
    setName(task?.name ?? "");
    setKeywords(task?.keywords.join(", ") ?? "");
    setSelectedPlatforms(task?.platforms ?? ["demo"]);
    setIntervalSeconds(task?.intervalSeconds ?? 300);
    setPriceMin(task?.priceMin != null ? String(task.priceMin) : "");
    setPriceMax(task?.priceMax != null ? String(task.priceMax) : "");
    setBrand(task?.brand ?? "");
    setModel(task?.model ?? "");
    setCategory(task?.category ?? "");
    setSeller(task?.seller ?? "");
    setChannelIds(task?.channels?.map((x) => x.channel.id) ?? []);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name,
      keywords: keywords
        .split(/[,，\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
      platforms: selectedPlatforms,
      intervalSeconds,
      priceMin: priceMin === "" ? null : Number(priceMin),
      priceMax: priceMax === "" ? null : Number(priceMax),
      brand: brand || null,
      model: model || null,
      category: category || null,
      seller: seller || null,
      channelIds,
    };
    try {
      if (editing) await api.updateTask(editing.id, body);
      else await api.createTask(body);
      setOpen(false);
      resetForm(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>监控任务</h1>
          <p>创建、启停与编辑任务。未支持平台可勾选但不会真实采集。</p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => {
            resetForm(null);
            setOpen(true);
          }}
        >
          新建任务
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>平台 / 关键词</th>
              <th>间隔</th>
              <th>状态</th>
              <th>检查时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <strong>{task.name}</strong>
                  <div className="muted">商品 {task._count?.listings ?? 0}</div>
                </td>
                <td>
                  <div className="chips">
                    {task.platforms.map((p) => (
                      <span className="chip" key={p}>
                        {platformName(p)}
                      </span>
                    ))}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {task.keywords.join(" / ")}
                  </div>
                </td>
                <td>{intervalLabel(task.intervalSeconds)}</td>
                <td>
                  <span className={`badge ${task.status}`}>
                    {task.status === "active" ? "运行中" : task.status === "paused" ? "已暂停" : "错误"}
                  </span>
                  {task.lastError && (
                    <div className="error-text" style={{ marginTop: 6, fontSize: "0.85rem" }}>
                      {task.lastError}
                    </div>
                  )}
                </td>
                <td>
                  <div>上次：{formatTime(task.lastCheckedAt)}</div>
                  <div>下次：{formatTime(task.nextCheckAt)}</div>
                </td>
                <td>
                  <div className="btn-row">
                    {task.status === "active" ? (
                      <button className="btn secondary" type="button" onClick={() => api.pauseTask(task.id).then(refresh)}>
                        暂停
                      </button>
                    ) : (
                      <button className="btn" type="button" onClick={() => api.enableTask(task.id).then(refresh)}>
                        启用
                      </button>
                    )}
                    <button className="btn secondary" type="button" onClick={() => api.runTask(task.id).then(() => setError(null))}>
                      立即检查
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        resetForm(task);
                        setOpen(true);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={async () => {
                        if (!confirm("确认删除任务？")) return;
                        await api.deleteTask(task.id);
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

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{editing ? "编辑任务" : "新建任务"}</h2>
            <form className="form" onSubmit={onSubmit}>
              <label>
                名称
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label>
                关键词（逗号分隔，支持中/日/英）
                <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} required rows={2} />
              </label>
              <div>
                <div style={{ marginBottom: 6 }}>平台</div>
                <div className="chips">
                  {platforms.map((p) => {
                    const checked = selectedPlatforms.includes(p.id);
                    return (
                      <label className="chip" key={p.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedPlatforms((prev) =>
                              checked ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                            );
                          }}
                        />
                        {platformName(p.id)}
                        <span className={`badge ${p.capability}`}>{p.capabilityLabel}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <label>
                检查间隔
                <select
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                >
                  {INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  最低价
                  <input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
                </label>
                <label>
                  最高价
                  <input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  品牌
                  <input value={brand} onChange={(e) => setBrand(e.target.value)} />
                </label>
                <label>
                  型号
                  <input value={model} onChange={(e) => setModel(e.target.value)} />
                </label>
                <label>
                  分类
                  <input value={category} onChange={(e) => setCategory(e.target.value)} />
                </label>
                <label>
                  卖家
                  <input value={seller} onChange={(e) => setSeller(e.target.value)} />
                </label>
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>通知渠道</div>
                <div className="chips">
                  {channels.map((ch) => {
                    const checked = channelIds.includes(ch.id);
                    return (
                      <label className="chip" key={ch.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setChannelIds((prev) =>
                              checked ? prev.filter((x) => x !== ch.id) : [...prev, ch.id],
                            );
                          }}
                        />
                        {ch.name} ({ch.type})
                      </label>
                    );
                  })}
                  {!channels.length && <span className="muted">请先在「通知渠道」中添加</span>}
                </div>
              </div>
              <div className="btn-row">
                <button className="btn" type="submit">
                  保存
                </button>
                <button className="btn secondary" type="button" onClick={() => setOpen(false)}>
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
