import { useCallback, useEffect, useState } from "react";
import { auth } from "./lib/firebase.js";
import "./AdminDashboard.css";

async function adminApi(path) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const token = await user.getIdToken();
  const response = await fetch(path, { headers: { Authorization: "Bearer " + token } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Admin request failed.");
  return body;
}

function formatBytes(bytes) {
  const mb = Number(bytes || 0) / (1024 * 1024);
  if (mb < 1024) return Math.round(mb) + " MB";
  return (mb / 1024).toFixed(1) + " GB";
}
function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? hours + "h " + minutes + "m" : minutes + "m";
}
function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminDashboard({ onExit }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi("/api/admin"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="pc-loading-screen"><div className="pc-loading-mark">𝄞</div><div className="pc-loading-copy">Loading admin dashboard</div><div className="pc-loading-track"><i /></div></div>;
  if (error) return <div className="pc-loading-screen"><div className="pc-loading-mark">𝄞</div><h1>Admin access required</h1><p>{error}</p><button className="pc-button primary" onClick={onExit}>Back to app</button></div>;

  const stats = data?.stats || {};
  const users = stats.users || {};
  const sessions = stats.sessions || {};
  const files = stats.files || {};
  const tasks = stats.tasks || {};
  const planBreakdown = stats.planBreakdown || [];
  const recentUsers = data?.recentUsers || [];

  return <div className="pc-admin">
    <header className="pc-admin-header">
      <div>
        <span className="pc-eyebrow">ADMIN</span>
        <h1>Piano Coach overview</h1>
        <p>Live figures from the database. Updated each time you open this page.</p>
      </div>
      <div className="pc-admin-header-actions">
        <button className="pc-button outline" onClick={load}>Refresh</button>
        <button className="pc-button dark" onClick={onExit}>Back to app</button>
      </div>
    </header>

    <nav className="pc-admin-tabs" aria-label="Admin sections">
      <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Users</button>
    </nav>

    {tab === "overview" && <div>
      <section className="pc-admin-stat-grid">
        <div className="pc-admin-stat-card"><span>TOTAL USERS</span><b>{users.total || 0}</b><small>{users.new_this_week || 0} joined this week</small></div>
        <div className="pc-admin-stat-card"><span>PRACTICE SESSIONS</span><b>{sessions.total_sessions || 0}</b><small>{sessions.sessions_this_week || 0} this week</small></div>
        <div className="pc-admin-stat-card"><span>PRACTICE TIME</span><b>{formatDuration(sessions.total_seconds)}</b><small>Lifetime total</small></div>
        <div className="pc-admin-stat-card"><span>AVERAGE SCORE</span><b>{Math.round(Number(sessions.avg_score) || 0)}%</b><small>Across scored sessions</small></div>
        <div className="pc-admin-stat-card"><span>FILES STORED</span><b>{files.total_files || 0}</b><small>{formatBytes(files.total_bytes)}</small></div>
        <div className="pc-admin-stat-card"><span>LEARNING TASKS</span><b>{tasks.total_tasks || 0}</b><small>Across all Grade Plans</small></div>
      </section>

      <div className="pc-admin-grid">
        <section className="pc-panel">
          <div className="pc-panel-heading"><div><span className="pc-eyebrow">SUBSCRIPTIONS</span><h3>Plan breakdown</h3></div></div>
          <div className="pc-admin-plans">
            {(planBreakdown.length ? planBreakdown : [
              { plan: "free", count: users.free || 0, practice_seconds: 0 },
              { plan: "basic", count: users.basic || 0, practice_seconds: 0 },
              { plan: "pro", count: users.pro || 0, practice_seconds: 0 },
            ]).map(row => (
              <div className="pc-admin-plan-row" key={row.plan}>
                <span className={"pc-admin-plan-tag " + row.plan}>{String(row.plan).toUpperCase()}</span>
                <strong>{row.count} {Number(row.count) === 1 ? "user" : "users"}</strong>
                <small>{formatDuration(row.practice_seconds)} practised</small>
              </div>
            ))}
          </div>
        </section>

        <section className="pc-panel">
          <div className="pc-panel-heading"><div><span className="pc-eyebrow">STORAGE</span><h3>Files</h3></div></div>
          <div className="pc-admin-files">
            <div className="pc-admin-file-row"><span>Sheet music</span><b>{files.sheet_files || 0}</b></div>
            <div className="pc-admin-file-row"><span>Audio recordings</span><b>{files.audio_files || 0}</b></div>
            <div className="pc-admin-file-row"><span>Total storage</span><b>{formatBytes(files.total_bytes)}</b></div>
          </div>
        </section>
      </div>

      {users.pending_deletion > 0 && <div className="pc-admin-alert">
        <strong>{users.pending_deletion} account{users.pending_deletion === 1 ? "" : "s"} pending deletion</strong>
        <span>These are permanently removed after their 15-day grace period ends.</span>
      </div>}
    </div>}

    {tab === "users" && <section className="pc-panel">
      <div className="pc-panel-heading"><div><span className="pc-eyebrow">RECENT SIGN-UPS</span><h3>Latest 50 accounts</h3></div></div>
      <div className="pc-admin-user-table">
        <div className="pc-admin-user-head"><span>Email</span><span>Plan</span><span>Joined</span><span>Sessions</span><span>Practice</span></div>
        {recentUsers.map((u, i) => (
          <div className="pc-admin-user-row" key={u.email + i}>
            <span className="pc-admin-user-email">{u.email}</span>
            <span><span className={"pc-admin-plan-tag small " + u.plan}>{u.plan}</span></span>
            <span>{formatDate(u.created_at)}</span>
            <span>{u.session_count || 0}</span>
            <span>{formatDuration(u.practice_seconds)}</span>
          </div>
        ))}
      </div>
    </section>}
  </div>;
}
