import { useEffect, useState } from "react";
import { api, type PlatformStatus } from "../api";
import { platformName } from "../lib/format";

export function PlatformsPage() {
  const [items, setItems] = useState<PlatformStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .platforms()
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error-text">{error}</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>平台状态</h1>
          <p>未确认允许的数据来源前，不会显示为「已支持」。平台名称保留日文原名。</p>
        </div>
      </div>
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>日文原名</th>
              <th>中文</th>
              <th>能力</th>
              <th>MVP 可选</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{platformName(p.id)}</td>
                <td>{p.nameZh}</td>
                <td>
                  <span className={`badge ${p.capability}`}>{p.capabilityLabel}</span>
                </td>
                <td>{p.selectableInMvp ? "是" : "否"}</td>
                <td className="muted">{p.notesZh}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
