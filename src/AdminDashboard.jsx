import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "./lib/admin-api.js";
import AdminLegalPages from "./AdminLegalPages.jsx";
import "./AdminDashboard.css";

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
function formatCode(value) { const code = String(value || "").replace(/\s+/g, "").toUpperCase(); return /^[A-Z0-9]{8}$/.test(code) ? code.slice(0, 4) + " " + code.slice(4) : code; }
function formatCodeInput(value) { const code = String(value || "").replace(/\s+/g, "").toUpperCase(); return /^[A-Z0-9]{0,8}$/.test(code) && code.length > 4 ? code.slice(0, 4) + " " + code.slice(4) : code; }
function formatDiscount(item) {
  return item.discount_type === "percent" ? Number(item.discount_value) + "%" : "£" + Number(item.discount_value).toFixed(2);
}

export default function AdminDashboard({ onExit }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    code: "", discountType: "percent", value: "10", duration: "once",
    durationInMonths: "3", allowedEmail: "", maxRedemptions: "", expiresAt: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await adminApi("/api/billing/admin")); }
    catch (err) { if (err.status === 403) { window.location.replace("/"); return; } setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.recentUsers || []).filter(user => !query || String(user.email || "").toLowerCase().includes(query) || String(user.display_name || "").toLowerCase().includes(query));
  }, [data?.recentUsers, search]);

  async function createDiscount(event) {
    event.preventDefault();
    setSavingDiscount(true);
    setMessage("");
    try {
      const result = await adminApi("/api/billing/admin-discounts", { method: "POST", body: { ...form, code: form.code.replace(/\\s+/g, "") } });
      const createdCode = result.discountCode?.code;
      setMessage(createdCode ? "Discount created. Share this code: " + formatCode(createdCode) : "Discount code created in Stripe and saved.");
      setForm(current => ({ ...current, code: "", allowedEmail: "", maxRedemptions: "", expiresAt: "" }));
      await load();
      setTab("discounts");
    } catch (err) { setMessage(err.message || "The discount code could not be created."); }
    finally { setSavingDiscount(false); }
  }

  async function deactivateDiscount(item) {
    if (!window.confirm("Deactivate " + item.code + "? It will no longer be accepted at checkout.")) return;
    setMessage("");
    try {
      await adminApi("/api/billing/admin-discount-deactivate", { method: "POST", body: { id: item.id } });
      setMessage(item.code + " has been deactivated.");
      await load();
    } catch (err) { setMessage(err.message || "The discount code could not be deactivated."); }
  }

  if (loading && !data) return <div className="pc-loading-screen"><img className="pc-loading-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><div className="pc-loading-copy">Loading admin dashboard</div><div className="pc-loading-track"><i /></div></div>;
  if (error && !data) return <div className="pc-loading-screen"><img className="pc-loading-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><h1>Admin access required</h1><p>{error}</p><button className="pc-button primary" onClick={onExit}>Back to app</button></div>;

  const stats = data?.stats || {};
  const users = stats.users || {};
  const sessions = stats.sessions || {};
  const files = stats.files || {};
  const tasks = stats.tasks || {};
  const planBreakdown = stats.planBreakdown || [];
  const recentUsers = data?.recentUsers || [];
  const discounts = data?.discountCodes || [];

  return <div className="pc-admin">
    <header className="pc-admin-header">
      <div><span className="pc-eyebrow">PIANO COACH · ADMIN</span><h1>Admin dashboard</h1><p>Manage your service and keep an eye on how students are doing.</p></div>
      <div className="pc-admin-header-actions"><button className="pc-button outline" onClick={load} disabled={loading}>Refresh</button><button className="pc-button dark" onClick={onExit}>Back to app</button></div>
    </header>

    <nav className="pc-admin-tabs" aria-label="Admin sections">
      <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Users</button>
      <button className={tab === "discounts" ? "active" : ""} onClick={() => setTab("discounts")}>Discount codes</button>
      <button className={tab === "legal" ? "active" : ""} onClick={() => setTab("legal")}>Legal pages</button>
    </nav>
    {message && <p className="pc-admin-message" role="status">{message}</p>}
    {error && data && <p className="pc-admin-message error" role="alert">{error}</p>}

    {tab === "overview" && <div>
      <section className="pc-admin-stat-grid">
        <div className="pc-admin-stat-card"><span>TOTAL USERS</span><b>{users.total || 0}</b><small>{users.new_this_week || 0} joined this week</small></div>
        <div className="pc-admin-stat-card"><span>PAID STUDENTS</span><b>{users.paid_students || 0}</b><small>{users.basic || 0} Basic · {users.pro || 0} Pro</small></div>
        <div className="pc-admin-stat-card"><span>PENDING DELETIONS</span><b>{users.pending_deletion || 0}</b><small>Within the 15-day grace period</small></div>
        <div className="pc-admin-stat-card"><span>FILES STORED</span><b>{files.total_files || 0}</b><small>{formatBytes(files.total_bytes)}</small></div>
      </section>
      {Number(users.duplicate_profiles || 0) > 0 && <p className="pc-admin-message error">{users.duplicate_profiles} extra Firebase profile record(s) share an existing student email. They are grouped below for clarity; subscriptions and learning data have not been merged.</p>}
      <div className="pc-admin-grid">
        <section className="pc-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">SUBSCRIPTIONS</span><h3>Plan breakdown</h3></div></div>
          <div className="pc-admin-plans">{["free","basic","pro"].map(plan => {
            const row = planBreakdown.find(item => item.plan === plan) || { count: users[plan] || 0, practice_seconds: 0 };
            return <div className="pc-admin-plan-row" key={plan}><span className={"pc-admin-plan-tag " + plan}>{plan.toUpperCase()}</span><strong>{row.count || 0} users</strong><small>{formatDuration(row.practice_seconds)} practised</small></div>;
          })}</div>
        </section>
        <section className="pc-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">ACTIVITY</span><h3>Practice & storage</h3></div></div>
          <div className="pc-admin-files"><div className="pc-admin-file-row"><span>Completed sessions</span><b>{sessions.total_sessions || 0}</b></div><div className="pc-admin-file-row"><span>Total practice time</span><b>{formatDuration(sessions.total_seconds)}</b></div><div className="pc-admin-file-row"><span>Average score</span><b>{Math.round(Number(sessions.avg_score) || 0)}%</b></div><div className="pc-admin-file-row"><span>Sheet music / audio</span><b>{files.sheet_files || 0} / {files.audio_files || 0}</b></div><div className="pc-admin-file-row"><span>Learning tasks</span><b>{tasks.total_tasks || 0}</b></div></div>
        </section>
      </div>
      <div className="pc-admin-grid">
        <section className="pc-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">ACCESS</span><h3>Administrators</h3></div></div>
          {(data?.admins || []).map(admin => <div className="pc-admin-file-row" key={admin.email}><span>{admin.email}</span><b>{admin.active ? admin.role : "Disabled"}</b></div>)}
        </section>
        <section className="pc-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">ACCOUNT REQUESTS</span><h3>Pending deletions</h3></div></div>
          {(data?.pendingDeletions || []).length ? data.pendingDeletions.map(item => <div className="pc-admin-file-row" key={item.email}><span><strong>{item.email}</strong><small className="pc-admin-subline">Due {formatDate(item.deletion_scheduled_at)}</small></span><b>Pending</b></div>) : <p className="pc-admin-empty">No accounts are waiting for deletion.</p>}
        </section>
      </div>
      <section className="pc-panel pc-admin-audit"><div className="pc-panel-heading"><div><span className="pc-eyebrow">ADMIN HISTORY</span><h3>Recent actions</h3></div></div>
        {(data?.auditLog || []).length ? data.auditLog.map((item,index) => <div className="pc-admin-file-row" key={item.entity_id + item.action + index}><span><strong>{item.action.replaceAll("."," ")}</strong><small className="pc-admin-subline">{item.admin_email} · {item.entity_id || item.entity_type}</small></span><small>{formatDate(item.created_at)}</small></div>) : <p className="pc-admin-empty">Admin actions will appear here.</p>}
      </section>
    </div>}

    {tab === "users" && <section className="pc-panel">
      <div className="pc-panel-heading"><div><span className="pc-eyebrow">STUDENT ACCOUNTS</span><h3>Recent users</h3></div><span>{filteredUsers.length} shown</span></div>
      <input className="pc-admin-search" type="search" placeholder="Search by name or email" value={search} onChange={event => setSearch(event.target.value)}/>
      <div className="pc-admin-user-table">
        <div className="pc-admin-user-head"><span>Student</span><span>Plan</span><span>Status</span><span>Joined</span><span>Sessions</span><span>Practice</span></div>
        {filteredUsers.map(user => <div className="pc-admin-user-row" key={user.email}>
          <span className="pc-admin-user-email"><strong>{user.display_name || "Student"}</strong><small className="pc-admin-subline">{user.email}</small></span>
          <span><span className={"pc-admin-plan-tag small " + (user.profile_count > 1 ? "multiple" : user.plan)}>{user.plan_summary || user.plan}</span></span>
          <span>{user.profile_count > 1 ? <><strong>Multiple profiles</strong><small className="pc-admin-subline">{user.profile_count} Firebase accounts · {user.active_subscriptions || 0} active subscriptions</small></> : user.subscription_status || "free"}</span>
          <span>{formatDate(user.created_at)}</span><span>{user.session_count || 0}</span><span>{formatDuration(user.practice_seconds)}</span>
        </div>)}
        {!filteredUsers.length && <p className="pc-admin-empty">No matching users found.</p>}
      </div>
    </section>}

    {tab === "discounts" && <div className="pc-admin-discounts">
      <section className="pc-panel">
        <div className="pc-panel-heading"><div><span className="pc-eyebrow">STRIPE PROMOTION</span><h3>Create a discount code</h3></div></div>
        <p className="pc-admin-help">Create a real Stripe discount. Leave the email blank to allow anyone to use it.</p>
        <form className="pc-admin-discount-form" onSubmit={createDiscount}>
          <label>Code<input value={form.code} onChange={e=>setForm({...form,code:formatCodeInput(e.target.value)})} placeholder={form.allowedEmail ? "Generated automatically" : "WELCOME20"} minLength={4} maxLength={24} required={!form.allowedEmail} disabled={Boolean(form.allowedEmail)}/><small>{form.allowedEmail ? "A unique 8-character code will be generated for this email." : "Use 4–24 letters, numbers, hyphens or underscores."}</small></label>
          <label>Discount type<select value={form.discountType} onChange={e=>setForm({...form,discountType:e.target.value})}><option value="percent">Percentage</option><option value="amount">Fixed amount (GBP)</option></select></label>
          <label>{form.discountType==="percent"?"Percentage off":"Amount off (£)"}<input type="number" min="0.01" max={form.discountType==="percent"?"100":"9999.99"} step="0.01" value={form.value} onChange={e=>setForm({...form,value:e.target.value})} required/></label>
          <label>Duration<select value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})}><option value="once">First payment only</option><option value="repeating">Repeat for a set period</option><option value="forever">For every renewal</option></select></label>
          {form.duration==="repeating" && <label>Months<input type="number" min="1" max="12" step="1" value={form.durationInMonths} onChange={e=>setForm({...form,durationInMonths:e.target.value})} required/></label>}
          <label>Allowed email (optional)<input type="email" value={form.allowedEmail} onChange={e=>setForm({...form,allowedEmail:e.target.value})} placeholder="Leave blank for everyone"/></label>
          <label>Maximum uses (optional)<input type="number" min="1" step="1" value={form.maxRedemptions} onChange={e=>setForm({...form,maxRedemptions:e.target.value})} placeholder="Unlimited"/></label>
          <label>Expiry date (optional)<input type="date" min={new Date().toISOString().slice(0,10)} value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></label>
          <div className="pc-admin-form-actions"><button className="pc-button dark" disabled={savingDiscount}>{savingDiscount?"Creating…":"Create discount code"}</button></div>
        </form>
      </section>
      <section className="pc-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">PROMOTION CODES</span><h3>Existing codes</h3></div><span>{discounts.length} total</span></div>
        <div className="pc-admin-discount-list">{discounts.map(item=><div className="pc-admin-discount-row" key={item.id}>
          <div><strong>{formatCode(item.code)}</strong><small>{formatDiscount(item)} off · {item.allowed_email || "Everyone"}</small></div>
          <div><small>{item.duration==="repeating"?item.duration_in_months+" months":item.duration==="forever"?"Every renewal":"First payment"}</small><small>{item.redemption_count || 0}{item.max_redemptions?" / "+item.max_redemptions:""} used</small></div>
          <div><span className={"pc-admin-status "+(item.active?"active":"inactive")}>{item.active?"Active":"Inactive"}</span>{item.active&&<button className="pc-admin-deactivate" onClick={()=>deactivateDiscount(item)}>Deactivate</button>}</div>
        </div>)}
        {!discounts.length && <p className="pc-admin-empty">No discount codes yet. Create your first code above.</p>}</div>
      </section>
    </div>}
    {tab === "legal" && <AdminLegalPages />}
  </div>;
}
