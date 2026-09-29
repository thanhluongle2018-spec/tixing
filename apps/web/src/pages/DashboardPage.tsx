import { useEffect, useState } from "react";
import { api, type Stats } from "../api";
import { platformName } from "../lib/format";

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error-text">{error}</p>;
  if (!stats) return <p className="muted">加载中…</p>;

  const rate =
    stats.notifications.successRate == null
      ? "—"
      : `${Math.round(stats.notifications.successRate * 100)}%`;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>概览</h1>
          <p>单用户自托管监控内核。MVP 仅 Demo 数据源可运行，真实平台为占位状态。</p>
        </div>
      </div>

      <div className="grid-stats">
        <div className="stat">
          <div className="label">任务总数</div>
          <div className="value">{stats.tasks.total}</div>
        </div>
        <div className="stat">
          <div className="label">运行中</div>
          <div className="value">{stats.tasks.active}</div>
        </div>
        <div className="stat">
          <div className="label">发现商品</div>
          <div className="value">{stats.listings.total}</div>
        </div>
        <div className="stat">
          <div className="label">通知成功率</div>
          <div className="value">{rate}</div>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>平台运行状态</h2>
        <table className="table">
          <thead>
            <tr>
              <th>平台</th>
              <th>状态</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {stats.platforms.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{platformName(p.id)}</strong>
                  <div className="muted">{p.nameZh}</div>
                </td>
                <td>
                  <span className={`badge ${p.capability}`}>{p.capabilityLabel}</span>
                </td>
                <td className="muted">{p.notesZh}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
