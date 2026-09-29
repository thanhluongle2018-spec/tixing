import { NavLink, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { TasksPage } from "./pages/TasksPage";
import { ListingsPage } from "./pages/ListingsPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { PlatformsPage } from "./pages/PlatformsPage";

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>提行</strong>
          <span>多平台商品上新监控</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            概览
          </NavLink>
          <NavLink to="/tasks">监控任务</NavLink>
          <NavLink to="/listings">商品列表</NavLink>
          <NavLink to="/channels">通知渠道</NavLink>
          <NavLink to="/platforms">平台状态</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/channels" element={<ChannelsPage />} />
          <Route path="/platforms" element={<PlatformsPage />} />
        </Routes>
      </main>
    </div>
  );
}
