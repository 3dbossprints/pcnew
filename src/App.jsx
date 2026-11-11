import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, updatePassword, updateProfile } from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase.js";
import "./PianoCoachApp.css";

const DocumentViewer = lazy(() => import("./DocumentViewer.jsx"));
const KeystoneLearnEngine = lazy(() => import("./KeystoneLearnEngine.jsx"));
const MusicXMLViewer = lazy(() => import("./MusicXMLViewer.jsx"));

const CATEGORIES = [
  { id: "pieces", title: "Pieces", detail: "Repertoire and performance pieces", icon: "♫" },
  { id: "exercises", title: "Exercises", detail: "Technique, control and coordination", icon: "⌁" },
  { id: "scales", title: "Scales", detail: "Scales, arpeggios and requirements", icon: "♬" },
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const blankTask = { id: "", category: "pieces", title: "", composer: "", notes: "", sourceFileId: "", sectionCount: 1 };

async function api(path, options = {}) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { Authorization: "Bearer " + token, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Piano Coach could not complete that request.");
  return body;
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? hours + "h " + minutes + "m" : minutes + "m";
}
function currentWeekDateKeys() {
  const monday = new Date();
  monday.setHours(0,0,0,0);
  monday.setDate(monday.getDate() - ((monday.getDay()+6)%7));
  return Array.from({length:7},(_,index)=>{const day=new Date(monday);day.setDate(monday.getDate()+index);return day.getFullYear()+"-"+String(day.getMonth()+1).padStart(2,"0")+"-"+String(day.getDate()).padStart(2,"0");});
}
function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function fileExt(file) { return String(file?.original_name || "").split(".").pop().toLowerCase(); }
function isMusicXml(file) { return ["xml", "musicxml"].includes(fileExt(file)); }
function isPdf(file) { return fileExt(file) === "pdf"; }
function isEpub(file) { return fileExt(file) === "epub"; }
function isAudio(file) { return file?.kind === "audio" || ["mp3", "m4a", "mp4", "webm", "wav", "mid", "midi"].includes(fileExt(file)); }
function getTaskAttempts(task, attempts) {
  return (attempts || []).filter(item => item.task_id === task.id).sort((a, b) => new Date(b.attempted_at) - new Date(a.attempted_at));
}
function sectionScore(task, attempts, index) {
  const key = "section-" + index;
  const direct = getTaskAttempts(task, attempts).filter(item => item.section_key === key && item.score !== null);
  const full = getTaskAttempts(task, attempts).filter(item => item.section_key === "full" && item.score !== null);
  const chosen = (direct.length ? direct : full).slice(0, 5);
  if (!chosen.length) return null;
  return chosen.reduce((sum, item) => sum + Number(item.score), 0) / chosen.length;
}
function taskProgress(task, attempts) {
  const scores = Array.from({ length: Number(task.section_count) || 1 }, (_, index) => sectionScore(task, attempts, index + 1));
  return Math.round(scores.reduce((sum, value) => sum + (value || 0), 0) / scores.length);
}
function taskHasProgress(task, attempts) {
  return getTaskAttempts(task, attempts).some(item => item.score !== null);
}
function getTaskFile(task, files) {
  return files.find(file => file.id === task.source_file_id) || null;
}
function Icon({ children, className = "" }) { return <span className={"pc-icon " + className} aria-hidden="true">{children}</span>; }

export default function App() {
  const [page, setPage] = useState("home");
  const [data, setData] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [openedDocument, setOpenedDocument] = useState(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [taskEditor, setTaskEditor] = useState(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [practiceConfig, setPracticeConfig] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const refresh = useCallback(async () => {
    const [account, library] = await Promise.all([api("/api/me"), api("/api/uploads")]);
    setData(account);
    setFiles(library.files || []);
    return account;
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [account, library] = await Promise.all([api("/api/me"), api("/api/uploads")]);
        if (!active) return;
        setData(account);
        setFiles(library.files || []);
      } catch (error) {
        if (active) setLoadError(error.message || "Your Piano Coach account could not be loaded.");
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  const toast = useCallback((message, type = "success") => {
    setNotice(message);
    setNoticeType(type);
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => setNotice(""), 3600);
  }, []);

  const user = data?.user || {};
  const summary = data?.practiceSummary || {};
  const tasks = data?.tasks || [];
  const attempts = data?.attempts || [];
  const plan = user.plan || "free";
  const displayName = user.preferred_name || user.display_name || auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "Piano student";
  const initials = displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const todaySeconds = Number(summary.todaySeconds || 0);
  const demoRemaining = Math.max(0, 3600 - Number(user.demo_seconds_used || 0));
  const hasExamBook = Boolean(user.exam_book_file_id);
  const freeLocked = plan === "free" && demoRemaining <= 0;

  useEffect(() => {
    document.documentElement.dataset.theme = data?.preferences?.theme || "light";
    document.documentElement.dataset.fontSize = data?.preferences?.font_size || "normal";
    return () => { document.documentElement.dataset.theme = "light"; document.documentElement.dataset.fontSize = "normal"; };
  }, [data?.preferences]);

  async function uploadFile(file, { purpose = "library", category = "other" } = {}) {
    if (!file) return null;
    const ext = file.name.toLowerCase().split(".").pop();
    const allowed = ["pdf", "epub", "xml", "musicxml", "mid", "midi", "png", "jpg", "jpeg", "mp3", "m4a", "mp4", "webm", "wav"];
    if (!allowed.includes(ext)) throw new Error("Choose a PDF, EPUB, MusicXML, MIDI, image or audio file.");
    if (file.size > 25 * 1024 * 1024) throw new Error("Files must be 25 MB or smaller.");
    const contentTypes = {
      pdf: "application/pdf", epub: "application/epub+zip", xml: "application/xml",
      musicxml: "application/vnd.recordare.musicxml+xml", mid: "audio/midi", midi: "audio/midi",
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp3: "audio/mpeg",
      m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm", wav: "audio/wav",
    };
    const contentType = contentTypes[ext] || file.type;
    const signed = await api("/api/uploads/sign", { method: "POST", body: { filename: file.name, contentType, size: file.size, purpose, category } });
    const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!put.ok) throw new Error("Secure storage rejected the upload. Please check the connection and try again.");
    const completed = await api("/api/uploads/complete", { method: "POST", body: { fileId: signed.fileId, purpose } });
    await refresh();
    return completed.file;
  }

  async function openFile(file) {
    setDocumentBusy(true);
    try {
      const result = await api("/api/uploads/download?id=" + encodeURIComponent(file.id) + "&inline=1");
      setOpenedDocument({ file, url: result.url, xml: null });
      if (isMusicXml(file)) {
        const response = await fetch(result.url);
        if (!response.ok) throw new Error("The MusicXML file could not be downloaded.");
        const xml = await response.text();
        setOpenedDocument({ file, url: result.url, xml });
      }
    } catch (error) { toast(error.message || "The document could not be opened.", "error"); }
    finally { setDocumentBusy(false); }
  }

  async function saveTask(draft) {
    if (!data?.learningPlanAvailable) {
      toast("The Grade Plan database migration needs to be reviewed and applied before tasks can be saved.", "error");
      return;
    }
    setProfileBusy(true);
    try {
      await api("/api/profile", { method: "PATCH", body: { taskAction: {
        action: "save", id: draft.id || undefined, category: draft.category, title: draft.title,
        composer: draft.composer, notes: draft.notes, sourceFileId: draft.sourceFileId || null,
        sectionCount: Number(draft.sectionCount) || 1,
      } } });
      await refresh();
      setTaskEditor(null);
      toast(draft.id ? "Your learning task has been updated." : "Added to your Grade Plan.");
    } catch (error) { toast(error.message, "error"); }
    finally { setProfileBusy(false); }
  }

  async function deleteTask(task) {
    if (!window.confirm("Remove " + task.title + " from your Grade Plan? Its recorded practice history will also be removed.")) return;
    try {
      await api("/api/profile", { method: "PATCH", body: { taskAction: { action: "delete", id: task.id } } });
      setSelectedTask(null);
      await refresh();
      toast("Task removed from your Grade Plan.");
    } catch (error) { toast(error.message, "error"); }
  }

  function beginPractice(task, sectionKey = "full", practiceMode = "standard", practiceType = "graded", referenceFile = null) {
    if (freeLocked) { setPage("profile"); toast("Your 60-minute demo has been used. Choose a subscription to continue.", "error"); return; }
    const actualFile = referenceFile || (task ? getTaskFile(task, files) : null);
    const actualPracticeType = actualFile?.metadata?.purpose === "personal_piece" ? "personal" : practiceType;
    if (actualPracticeType === "graded" && plan !== "free" && !hasExamBook) { setPage("home"); toast("Upload your exam-board ebook to unlock graded learning.", "error"); return; }
    if (practiceMode === "assisted" && (!actualFile || !isMusicXml(actualFile))) {
      toast("Assisted Practice needs a MusicXML score so the notes and timing can be checked. Choose Standard for this document.", "error");
      return;
    }
    setPracticeConfig({ task: task || null, sectionKey, mode: practiceMode, practiceType: actualPracticeType, referenceFile: actualFile, demoRemainingSeconds: plan === "free" ? demoRemaining : null });
    setFeedback(null);
    setPage("practice");
  }

  if (loading) return <div className="pc-loading-screen"><div className="pc-loading-mark">𝄞</div><div className="pc-loading-copy">Preparing your musical space</div><div className="pc-loading-track"><i /></div></div>;
  if (loadError) return <div className="pc-loading-screen"><div className="pc-loading-mark">𝄞</div><h1>Your account needs attention.</h1><p>{loadError}</p><button className="pc-button primary" onClick={() => window.location.reload()}>Try again</button></div>;

  return <div className="pc-app">
    <aside className="pc-sidebar">
      <div className="pc-brand"><span className="pc-brand-mark">𝄞</span><div><strong>Piano <em>Coach</em></strong><small>YOUR MUSICAL JOURNEY</small></div></div>
      <div className="pc-sidebar-label">YOUR SPACE</div>
      <nav className="pc-nav" aria-label="Main navigation">
        <button className={page === "home" ? "active" : ""} onClick={() => { setSelectedTask(null); setPage("home"); }}><Icon>⌂</Icon><span>Home</span></button>
        <button className={page === "practice" ? "active" : ""} onClick={() => { setSelectedTask(null); setPracticeConfig(null); setFeedback(null); setPage("practice"); }}><Icon>♫</Icon><span>Practice</span></button>
      </nav>
      <div className="pc-sidebar-spacer" />
      <div className="pc-sidebar-encouragement"><span>✧</span><strong>Small steps.<br/>Beautiful music.</strong><p>A little thoughtful practice adds up.</p><button onClick={() => { setPage("practice"); setPracticeConfig(null); }}>Begin a session <b>↗</b></button></div>
      <button className="pc-sidebar-profile" onClick={() => setPage("profile")}><span className="pc-avatar">{initials}</span><span><strong>{displayName}</strong><small>{user.grade || "Piano student"}{user.exam_board ? " · " + user.exam_board : ""}</small></span><b>•••</b></button>
    </aside>
    <main className="pc-main">
      <header className="pc-topbar">
        <div className="pc-breadcrumb"><span>PIANO COACH</span><i>/</i><strong>{page === "profile" ? "Profile" : page === "practice" ? (feedback ? "Practice feedback" : "Practice") : selectedTask ? selectedTask.title : "Home"}</strong></div>
        <div className="pc-topbar-actions">
          <span className={"pc-plan-tag " + plan}>{plan === "free" ? "FREE DEMO" : plan.toUpperCase()}</span>
          <button className="pc-profile-trigger" onClick={() => { setSelectedTask(null); setPage("profile"); }}><span className="pc-avatar mini">{initials}</span><span>{displayName}</span><b>⌄</b></button>
        </div>
      </header>
      <div className="pc-content">
        {page === "home" && !selectedTask && <Dashboard data={data} displayName={displayName} tasks={tasks} attempts={attempts} files={files} onOpenTask={setSelectedTask} onAddTask={category => setTaskEditor({ ...blankTask, category })} onOpenLibrary={() => setShowLibrary(true)} onPractice={beginPractice} freeLocked={freeLocked} onRefresh={refresh}/>}
        {page === "home" && selectedTask && <TaskDetails task={selectedTask} attempts={attempts} files={files} onBack={() => setSelectedTask(null)} onPractice={beginPractice} onEdit={() => setTaskEditor({ ...blankTask, ...selectedTask, sourceFileId: selectedTask.source_file_id || "" })} onDelete={deleteTask}/>}
        {page === "practice" && <PracticeHub tasks={tasks} files={files} attempts={attempts} plan={plan} hasExamBook={hasExamBook} freeLocked={freeLocked} config={practiceConfig} onStart={beginPractice} onOpenFile={openFile} onReturn={() => { setPracticeConfig(null); setFeedback(null); setPage("home"); }} feedback={feedback} setFeedback={setFeedback} toast={toast} refresh={refresh}/>}
        {page === "profile" && <ProfilePage data={data} onSaved={async () => { await refresh(); toast("Your profile has been saved."); }} toast={toast} onRefresh={refresh}/>}
      </div>
    </main>

    {taskEditor && <TaskEditor draft={taskEditor} files={files.filter(file => file.kind === "sheet" && !isEpub(file))} busy={profileBusy} onClose={() => setTaskEditor(null)} onSave={saveTask}/>}
    {showLibrary && <LibraryModal files={files} busy={documentBusy} onClose={() => setShowLibrary(false)} onOpen={openFile} onUpload={uploadFile} onRefresh={refresh} toast={toast} plan={plan}/>}
    {openedDocument && <Suspense fallback={<div className="pc-modal-loading">Opening your music…</div>}>
      {openedDocument.xml ? <div className="pc-doc-modal"><header><div><span className="pc-eyebrow">SHEET MUSIC</span><strong>{openedDocument.file.original_name}</strong></div><button onClick={() => setOpenedDocument(null)}>Close ×</button></header><MusicXMLViewer xml={openedDocument.xml} title={openedDocument.file.original_name}/></div> :
        <DocumentViewer file={openedDocument.file} url={openedDocument.url} getToken={() => auth.currentUser.getIdToken()} onClose={() => setOpenedDocument(null)} onUseForPractice={(file) => { setOpenedDocument(null); beginPractice(null,"full","standard",file.metadata?.purpose === "personal_piece" ? "personal" : "graded",file); }}/>}
    </Suspense>}
    {notice && <div className={"pc-toast " + noticeType} role="status"><span>{noticeType === "error" ? "!" : "✓"}</span>{notice}</div>}
  </div>;
}

function Dashboard({ data, displayName, tasks, attempts, files, onOpenTask, onAddTask, onOpenLibrary, onPractice, freeLocked, onRefresh }) {
  const user = data?.user || {};
  const summary = data?.practiceSummary || {};
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const todaySeconds = Number(summary.todaySeconds || 0);
  const remaining = Math.max(0, 900 - todaySeconds);
  const demoRemaining = Math.max(0, 3600 - Number(user.demo_seconds_used || 0));
  const categories = CATEGORIES.map(category => ({ ...category, tasks: tasks.filter(task => task.category === category.id) }));
  const weekDates = currentWeekDateKeys();
  const practiced = new Set(summary.practiceDays || []);
  const avg = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + taskProgress(task, data.attempts || []), 0) / tasks.length) : null;
  return <div className="pc-dashboard">
    <div className="pc-welcome-row"><div><span className="pc-eyebrow">{today.toUpperCase()}</span><h1>{greeting}, {displayName.split(" ")[0]}<em>.</em></h1><p>Make a little space for music today.</p></div><button className="pc-button outline" onClick={onOpenLibrary}>Your sheet music <span>↗</span></button></div>
    <section className="pc-hero-panel">
      <div className="pc-hero-copy"><span className="pc-eyebrow">YOUR MUSICAL JOURNEY</span><h2>{user.grade ? user.grade + " piano" : "Your piano journey"}<br/><i>{user.exam_board ? user.exam_board + " board" : "starts here"}.</i></h2>
        <p>{user.target_date ? "Working towards " + formatDate(user.target_date) + ". Keep your practice steady and focused." : "A good practice session is more valuable than a perfect plan. Choose what you would like to work on."}</p>
        <div className="pc-hero-actions"><button className="pc-button dark" onClick={() => onPractice(null)}>Start practising <span>↗</span></button><span>{tasks.length ? tasks.length + " learning " + (tasks.length === 1 ? "task" : "tasks") : "Build your learning plan"}</span></div>
      </div>
      <div className="pc-hero-art" aria-hidden="true"><div className="pc-orbit orbit-one"/><div className="pc-orbit orbit-two"/><div className="pc-note note-one">♪</div><div className="pc-note note-two">♫</div><div className="pc-note note-three">♩</div><div className="pc-art-disc">𝄞</div></div>
    </section>
    <section className="pc-stat-row">
      <StatCard label="THIS WEEK" value={formatDuration(summary.weeklySeconds)} note="Recorded practice" icon="◷"/>
      <StatCard label="SESSIONS" value={String(summary.sessionsThisWeek || 0)} note="This week" icon="♫"/>
      <StatCard label="DAILY STREAK" value={String(summary.streakDays || 0) + " days"} note={remaining ? formatDuration(remaining) + " to today's 15-minute goal" : "15-minute goal reached today"} icon="✧"/>
      <StatCard label={user.plan === "free" ? "DEMO REMAINING" : "LEARNING PROGRESS"} value={user.plan === "free" ? formatDuration(demoRemaining) : avg === null ? "—" : avg + "%"} note={user.plan === "free" ? "Lifetime allowance" : "Across your saved tasks"} icon="◎"/>
    </section>
    {freeLocked && <div className="pc-notice-banner"><strong>Your free practice hour has been used.</strong><span>Your progress and account remain here. Choose a plan from Profile to continue learning.</span></div>}
    {user.plan !== "free" && !user.exam_book_file_id && <div className="pc-notice-banner"><strong>Your graded syllabus is waiting for its ebook.</strong><span>Upload your own exam-board PDF or EPUB in Grade Plan. Your account and own repertoire remain available.</span></div>}
    <div className="pc-section-heading"><div><span className="pc-eyebrow">YOUR LEARNING PLAN</span><h2>What would you like to work on?</h2></div><span className="pc-section-side">You choose the next step.</span></div>
    <div className="pc-learning-grid">
      {categories.map(category => <section className="pc-learning-card" key={category.id}>
        <header><span className="pc-category-icon">{category.icon}</span><div><h3>{category.title}</h3><p>{category.tasks.length ? category.tasks.length + " saved " + (category.tasks.length === 1 ? "task" : "tasks") : category.detail}</p></div><button aria-label={"Add " + category.title.toLowerCase()} onClick={() => onAddTask(category.id)}>＋</button></header>
        {category.tasks.length ? <div className="pc-task-list">{category.tasks.slice(0,4).map(task => <TaskRow key={task.id} task={task} attempts={attempts} onClick={() => onOpenTask(task)}/>)}
          {category.tasks.length > 4 && <button className="pc-text-link" onClick={() => onOpenTask(category.tasks[4])}>View all {category.tasks.length} tasks →</button>}
        </div> : <div className="pc-empty-category"><span>＋</span><p>No {category.title.toLowerCase()} added yet.</p><button onClick={() => onAddTask(category.id)}>Add your first {category.title.slice(0,-1).toLowerCase()}</button></div>}
      </section>)}
    </div>
    {user.plan === "pro" && <section className="pc-extras-strip"><div><span className="pc-eyebrow">PIANO COACH PRO</span><h3>Your music, beyond the syllabus.</h3><p>Bring in a piece you love and keep it separate from your graded learning.</p></div><button className="pc-button outline" onClick={onOpenLibrary}>Open your music collection ↗</button></section>}
    <section className="pc-lower-grid">
      <div className="pc-panel pc-week-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">A STEADY RHYTHM</span><h3>Your practice this week</h3></div><span>{summary.practiceDaysThisWeek || 0}/7 days</span></div><div className="pc-week-days">{weekDates.map((date,index) => { const complete = practiced.has(date); const day = WEEKDAYS[(index+1)%7]; return <div key={date} className={complete ? "done" : ""}><span>{day.slice(0,1)}</span><i>{complete ? "✓" : ""}</i></div>; })}</div><p>Practise for at least 15 minutes in a day to keep your streak going.</p></div>
      <div className="pc-panel pc-materials-panel"><div><span className="pc-eyebrow">YOUR MATERIALS</span><h3>Sheet music & recordings</h3><p>{files.length ? files.length + " saved " + (files.length === 1 ? "file" : "files") + " in your collection." : "Keep scores and recordings together in one place."}</p></div><button className="pc-button outline" onClick={onOpenLibrary}>Open collection ↗</button></div>
    </section>
  </div>;
}

function StatCard({ label, value, note, icon }) {
  return <div className="pc-stat-card"><div><span>{label}</span><b>{value}</b><small>{note}</small></div><i>{icon}</i></div>;
}
function TaskRow({ task, attempts, onClick }) {
  const progress = taskProgress(task, attempts);
  const hasProgress = taskHasProgress(task, attempts);
  return <button className="pc-task-row" onClick={onClick}><span className="pc-task-dot"/><span className="pc-task-name"><strong>{task.title}</strong><small>{task.composer || (task.section_count > 1 ? task.section_count + " sections" : "Learning task")}</small></span><span className="pc-task-score">{hasProgress ? progress + "%" : "—"}</span><span className="pc-row-arrow">↗</span></button>;
}

function TaskDetails({ task, attempts, files, onBack, onPractice, onEdit, onDelete }) {
  const related = getTaskAttempts(task, attempts);
  const scored = related.filter(item => item.score !== null).slice(0, 30).reverse();
  const file = getTaskFile(task, files);
  const progress = taskProgress(task, attempts);
  const areas = Array.from({ length: Number(task.section_count) || 1 }, (_, index) => {
    const score = sectionScore(task, attempts, index + 1);
    return { key: "section-" + (index + 1), label: "Section " + (index + 1), score };
  }).filter(item => item.score !== null && item.score < 80).sort((a,b) => a.score-b.score);
  return <div className="pc-task-detail">
    <button className="pc-back-link" onClick={onBack}>← Back to Home</button>
    <div className="pc-detail-title-row"><div><span className="pc-eyebrow">{task.category.toUpperCase()} · YOUR GRADE PLAN</span><h1>{task.title}</h1><p>{task.composer || task.notes || "Your personal learning task."}</p></div><div className="pc-detail-actions"><button className="pc-button outline" onClick={onEdit}>Edit task</button><button className="pc-button dark" onClick={() => onPractice(task)}>Practice this task ↗</button></div></div>
    {file && <div className="pc-linked-score"><span className="pc-file-icon">{isMusicXml(file) ? "♫" : isPdf(file) ? "▤" : "♪"}</span><div><strong>{file.original_name}</strong><small>Linked score in your sheet music collection</small></div></div>}
    <div className="pc-detail-stats"><div><span>OVERALL ACHIEVEMENT</span><strong>{related.length ? progress + "%" : "Not assessed"}</strong><small>Recent performance across sections</small></div><div><span>PRACTICE SESSIONS</span><strong>{related.length}</strong><small>Recorded attempts</small></div><div><span>SECTIONS</span><strong>{task.section_count}</strong><small>Tracked independently</small></div></div>
    <div className="pc-detail-grid">
      <section className="pc-panel pc-history-panel"><span className="pc-eyebrow">PROGRESS HISTORY</span><h2>Your improvement over time</h2>
        {scored.length ? <ProgressChart values={scored.map(item => Number(item.score))}/> : <div className="pc-empty-chart"><span>⌁</span><p>Your progress graph will appear after your first scored practice session.</p></div>}
        {scored.length > 0 && <div className="pc-history-footer"><span>{formatDate(scored[0].attempted_at)}</span><span>{formatDate(scored[scored.length-1].attempted_at)}</span></div>}
      </section>
      <section className="pc-panel pc-improve-panel"><span className="pc-eyebrow">AREAS TO IMPROVE</span><h2>Where to focus next</h2>
        {areas.length ? areas.map(item => <div className="pc-improve-item" key={item.key}><span>↗</span><div><strong>{item.label}</strong><small>Recent average: {Math.round(item.score)}%</small></div><button onClick={() => onPractice(task,item.key)}>Practise</button></div>) : <div className="pc-improve-empty"><span>✧</span><p>{related.length ? "No consistently low-scoring sections have been identified yet." : "As you practise, we'll build a picture of what needs attention."}</p></div>}
      </section>
    </div>
    <section className="pc-panel pc-sections-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">CHOOSE YOUR FOCUS</span><h2>Practice a section</h2></div><button className="pc-button outline" onClick={() => onPractice(task)}>Practice whole task</button></div>
      <div className="pc-section-list">{Array.from({ length: Number(task.section_count) || 1 }, (_, index) => { const score = sectionScore(task, attempts, index+1); return <div className="pc-section-row" key={index}><span className="pc-section-number">{String(index+1).padStart(2,"0")}</span><div><strong>Section {index+1}</strong><small>{score === null ? "Not practised yet" : "Recent average · " + Math.round(score) + "%"}</small></div><div className="pc-section-meter"><i style={{width:(score === null ? 0 : score)+"%"}}/></div><button onClick={() => onPractice(task,"section-"+(index+1))}>Practice section ↗</button></div>; })}</div>
    </section>
    <button className="pc-danger-text" onClick={() => onDelete(task)}>Remove this learning task</button>
  </div>;
}

function ProgressChart({ values }) {
  const width=640,height=220,pad=20;
  const points=values.map((value,index)=>({x:pad+(values.length===1?(width-pad*2)/2:index/(values.length-1)*(width-pad*2)),y:height-pad-(value/100)*(height-pad*2)}));
  const d=points.map((point,index)=>(index?"L":"M")+point.x+" "+point.y).join(" ");
  return <svg className="pc-progress-chart" viewBox={"0 0 "+width+" "+height} role="img" aria-label="Practice score history">
    {[0,25,50,75,100].map(value=>{const y=height-pad-(value/100)*(height-pad*2);return <g key={value}><line x1={pad} x2={width-pad} y1={y} y2={y} className="pc-chart-grid"/><text x="0" y={y+4} className="pc-chart-label">{value}</text></g>;})}
    <path d={d} className="pc-chart-path"/>{points.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r="4.5" className="pc-chart-point"/> )}
  </svg>;
}

function TaskEditor({ draft, files, busy, onClose, onSave }) {
  const [value,setValue] = useState(draft);
  const [error,setError] = useState("");
  const update=(key,next)=>setValue(current=>({...current,[key]:next}));
  function submit(event) {
    event.preventDefault();
    if (!value.title.trim()) { setError("Give this task a title."); return; }
    onSave(value);
  }
  return <div className="pc-overlay" role="presentation"><form className="pc-modal pc-task-editor" onSubmit={submit}>
    <button type="button" className="pc-modal-close" onClick={onClose}>×</button><span className="pc-eyebrow">YOUR LEARNING PLAN</span><h2>{value.id ? "Edit learning task" : "Add to your learning plan"}</h2><p>Choose what you want to work towards. You can change it at any time.</p>
    <label>Type<select value={value.category} onChange={e=>update("category",e.target.value)}><option value="pieces">Piece</option><option value="exercises">Exercise</option><option value="scales">Scale</option></select></label>
    <label>Title<input value={value.title} maxLength={180} onChange={e=>update("title",e.target.value)} placeholder="e.g. Sonatina in C, first movement" required/></label>
    <label>Composer or short description<input value={value.composer || ""} maxLength={160} onChange={e=>update("composer",e.target.value)} placeholder="Optional"/></label>
    <label>Notes<textarea rows="3" value={value.notes || ""} onChange={e=>update("notes",e.target.value)} placeholder="What would you like to focus on?"/></label>
    <label>Linked sheet music<select value={value.sourceFileId || ""} onChange={e=>update("sourceFileId",e.target.value)}><option value="">No uploaded score</option>{files.map(file=><option key={file.id} value={file.id}>{file.original_name}</option>)}</select></label>
    <label>Number of practice sections<input type="number" min="1" max="100" value={value.sectionCount} onChange={e=>update("sectionCount",Math.max(1,Math.min(100,Number(e.target.value)||1)))}/><small>Use 1 if you want to practise the whole task as a single section.</small></label>
    {error&&<p className="pc-form-error">{error}</p>}
    <div className="pc-modal-actions"><button type="button" className="pc-button outline" onClick={onClose}>Cancel</button><button className="pc-button dark" disabled={busy}>{busy?"Saving…":"Save task"}</button></div>
  </form></div>;
}

function LibraryModal({ files, busy, onClose, onOpen, onUpload, onRefresh, toast, plan }) {
  const [uploading,setUploading]=useState(false);
  const [category,setCategory]=useState("pieces");
  const [purpose,setPurpose]=useState("library");
  const [error,setError]=useState("");
  const groups=[
    {id:"pieces",label:"Sheet music",filter:file=>file.kind==="sheet"&&file.metadata?.purpose!=="exam_book"},
    {id:"recordings",label:"Recordings",filter:file=>file.kind==="audio"},
    {id:"images",label:"Images",filter:file=>file.kind==="image"},
    {id:"books",label:"Exam ebook",filter:file=>file.metadata?.purpose==="exam_book"},
  ];
  async function upload(file) {
    if(!file)return;
    setUploading(true);setError("");
    try {
      const result=await onUpload(file,{purpose,category});
      toast(result?.original_name+" saved to your sheet music collection.");
      await onRefresh();
    } catch(e){setError(e.message||"Upload failed.");}
    finally{setUploading(false);}
  }
  async function remove(file) {
    if(!window.confirm("Delete "+file.original_name+" from your collection?"))return;
    try{await api("/api/uploads/delete?id="+encodeURIComponent(file.id),{method:"DELETE"});await onRefresh();toast("File deleted.");}
    catch(e){setError(e.message||"The file could not be deleted.");}
  }
  return <div className="pc-overlay"><section className="pc-modal pc-library-modal" role="dialog" aria-modal="true" aria-label="Sheet music collection">
    <button className="pc-modal-close" onClick={onClose}>×</button><span className="pc-eyebrow">YOUR MUSIC</span><h2>Sheet music collection</h2><p>Your scores, books and recordings, together in one place.</p>
    <div className="pc-library-upload-row"><label className="pc-select-label"><span>Save under</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="pieces">Pieces</option><option value="exercises">Exercises</option><option value="scales">Scales</option><option value="recordings">Recordings</option><option value="other">Other</option></select></label>
      <label className="pc-select-label"><span>Collection</span><select value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="library">My library</option>{plan==="pro"&&<option value="personal_piece">Pro Extras</option>}</select></label>
      <label className="pc-button dark pc-upload-button">{uploading?"Uploading…":"＋ Add a file"}<input type="file" accept=".pdf,.epub,.xml,.musicxml,.mid,.midi,.png,.jpg,.jpeg,.mp3,.m4a,.mp4,.webm,.wav" disabled={uploading} onChange={e=>{upload(e.target.files[0]);e.target.value="";}}/></label>
    </div>
    {error&&<p className="pc-form-error" role="alert">{error}</p>}
    <div className="pc-library-groups">{groups.map(group=>{const list=files.filter(group.filter);return <section key={group.id}><header><strong>{group.label}</strong><small>{list.length}</small></header>{list.length ? list.map(file=><div className="pc-file-row" key={file.id}><span className={"pc-file-icon "+(file.kind||"")}>{file.kind==="audio"?"◉":file.kind==="image"?"▧":isEpub(file)?"▤":"♫"}</span><button className="pc-file-info" onClick={()=>onOpen(file)}><strong>{file.original_name}</strong><small>{file.metadata?.purpose==="personal_piece"?"Pro Extras · ":""}{Math.max(1,Math.round(Number(file.size_bytes||0)/1024))} KB</small></button><button className="pc-file-open" onClick={()=>onOpen(file)}>Open ↗</button><button className="pc-file-delete" onClick={()=>remove(file)} aria-label={"Delete "+file.original_name}>×</button></div>):<p className="pc-file-empty">Nothing saved here yet.</p>}</section>;})}</div>
    <div className="pc-modal-actions"><button className="pc-button outline" onClick={onClose} disabled={busy}>Done</button></div>
  </section></div>;
}

function PracticeHub({ tasks, files, attempts, plan, hasExamBook, freeLocked, config, onStart, onOpenFile, onReturn, feedback, setFeedback, toast, refresh }) {
  const [chosenTask,setChosenTask]=useState("");
  const [chosenSection,setChosenSection]=useState("full");
  const [mode,setMode]=useState("standard");
  const [chosenFile,setChosenFile]=useState("");
  if (feedback) return <FeedbackPage feedback={feedback} onBack={onReturn} onAgain={() => {setFeedback(null);toast("Choose another practice session.");}} onOpenFile={onOpenFile}/>;
  if (config) return <PracticeSession key={config.task?.id+":"+config.sectionKey+":"+config.mode+":"+(config.referenceFile?.id||"none")} config={config} files={files} onComplete={result=>{setFeedback(result);refresh().catch(()=>{});}} onExit={onReturn}/>;
  const selected=tasks.find(task=>task.id===chosenTask)||null;
  const availableFiles=files.filter(file=>file.kind==="sheet"&&file.metadata?.purpose!=="exam_book");
  const reference=availableFiles.find(file=>file.id===chosenFile)||getTaskFile(selected,files);
  const locked=freeLocked || (plan!=="free"&&!hasExamBook);
  return <div className="pc-practice-hub">
    <div className="pc-welcome-row"><div><span className="pc-eyebrow">MAKE MUSIC TODAY</span><h1>Practice, with purpose<em>.</em></h1><p>Choose a task, decide how you would like to practise, and take it at your own pace.</p></div></div>
    <section className="pc-practice-chooser">
      <div className="pc-practice-step"><span>01</span><div><h2>What would you like to practise?</h2><p>Choose one of your saved learning tasks, or work from a score in your collection.</p></div></div>
      <div className="pc-chooser-fields">
        <label>Learning task<select value={chosenTask} onChange={e=>{setChosenTask(e.target.value);setChosenFile("");setChosenSection("full");}}><option value="">No task · free practice</option>{tasks.map(task=><option key={task.id} value={task.id}>{task.category.slice(0,-1)} · {task.title}</option>)}</select></label>
        <label>Sheet music<select value={chosenFile} onChange={e=>setChosenFile(e.target.value)}><option value="">Use linked score or no score</option>{availableFiles.map(file=><option value={file.id} key={file.id}>{file.original_name}</option>)}</select></label>
        {selected&&<label>Practice focus<select value={chosenSection} onChange={e=>setChosenSection(e.target.value)}><option value="full">Whole task</option>{Array.from({length:selected.section_count},(_,i)=><option key={i} value={"section-"+(i+1)}>Section {i+1}</option>)}</select></label>}
      </div>
      {selected&&<div className="pc-selected-task-info"><strong>{selected.title}</strong><span>{taskHasProgress(selected,attempts)?taskProgress(selected,attempts)+"% recent achievement":"Not assessed yet"}</span></div>}
      <div className="pc-practice-step second"><span>02</span><div><h2>Choose your practice mode</h2><p>Switch between guided learning and a more independent run-through.</p></div></div>
      <div className="pc-mode-grid">
        <button type="button" className={mode==="assisted"?"selected":""} onClick={()=>setMode("assisted")}><span className="pc-mode-icon">♫</span><strong>Assisted Practice</strong><p>Falling notes, an adaptive keyboard and live note checking for a MusicXML score.</p><small>Best for learning a passage</small></button>
        <button type="button" className={mode==="standard"?"selected":""} onClick={()=>setMode("standard")}><span className="pc-mode-icon">𝄞</span><strong>Standard Practice</strong><p>Use your sheet music and play through the piece independently while your session is recorded.</p><small>Best for run-throughs</small></button>
      </div>
      {locked&&<div className="pc-inline-warning">{freeLocked?"Your lifetime free hour has been used.":"Upload your exam-board ebook to unlock graded learning."} Your account and profile remain available.</div>}
      {mode==="assisted"&&(!reference||!isMusicXml(reference))&&<div className="pc-inline-warning">Assisted Practice currently needs a MusicXML file with playable note data. Choose a MusicXML score or switch to Standard Practice. PDF score recognition needs the separate OMR worker, which is not connected yet.</div>}
      <div className="pc-practice-start-row"><button className="pc-button dark" disabled={locked||(mode==="assisted"&&(!reference||!isMusicXml(reference)))} onClick={()=>onStart(selected,chosenSection,mode,reference?.metadata?.purpose==="personal_piece"?"personal":"graded",reference)}>Begin session ↗</button><span>Recording begins when your session starts. Microphone permission is requested then.</span></div>
    </section>
    <section className="pc-recent-practice"><div className="pc-section-heading"><div><span className="pc-eyebrow">YOUR LIBRARY</span><h2>Scores ready to practise</h2></div></div>
      {availableFiles.length ? <div className="pc-practice-file-grid">{availableFiles.slice(0,6).map(file=><button key={file.id} onClick={()=>onOpenFile(file)}><span className="pc-file-icon">{isMusicXml(file)?"♫":isPdf(file)?"▤":"♪"}</span><strong>{file.original_name}</strong><small>{file.metadata?.purpose==="personal_piece"?"Pro Extras":"Your collection"}</small><b>Open ↗</b></button>)}</div> : <div className="pc-empty-library"><p>No scores in your collection yet.</p><small>Upload MusicXML for Assisted Practice, or PDF/EPUB for reading during Standard Practice.</small></div>}
    </section>
  </div>;
}

function PracticeSession({ config, files, onComplete, onExit }) {
  const [session,setSession]=useState(null);
  const [elapsed,setElapsed]=useState(0);
  const [busy,setBusy]=useState(false);
  const [captureMessage,setCaptureMessage]=useState("Microphone is not connected.");
  const [captureLevel,setCaptureLevel]=useState(0);
  const [xml,setXml]=useState("");
  const [scoreLoadError,setScoreLoadError]=useState("");
  const [summary,setSummary]=useState(null);
  const [currentBar,setCurrentBar]=useState(null);
  const [captureAvailable,setCaptureAvailable]=useState(false);
  const micInputRef=useRef(null);
  const captureRef=useRef(null);
  const engineControlRef=useRef(null);
  const endingRef=useRef(false);
  const sessionStartRef=useRef(0);
  const configRef=useRef(config);
  configRef.current=config;
  const token=()=>auth.currentUser.getIdToken();

  useEffect(()=>{
    let cancelled=false;
    async function loadXml(){
      const file=config.referenceFile;
      if(!file||!isMusicXml(file))return;
      try{
        const link=await api("/api/uploads/download?id="+encodeURIComponent(file.id)+"&inline=1");
        const response=await fetch(link.url);
        if(!response.ok)throw new Error("The MusicXML score could not be retrieved from secure storage.");
        const text=await response.text();
        if(!cancelled)setXml(text);
      }catch(error){if(!cancelled)setScoreLoadError(error.message||"The score could not be loaded.");}
    }
    loadXml();
    return()=>{cancelled=true;};
  },[config.referenceFile?.id]);

  useEffect(()=>{
    if(!session)return;
    const timer=window.setInterval(()=>setElapsed(Math.floor((Date.now()-sessionStartRef.current)/1000)),500);
    return()=>window.clearInterval(timer);
  },[session?.id]);

  useEffect(()=>{
    if(session && config.demoRemainingSeconds !== null && config.demoRemainingSeconds !== undefined && elapsed >= config.demoRemainingSeconds) finishSession(null);
  },[elapsed,session?.id,config.demoRemainingSeconds]);

  async function beginCapture(assisted) {
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("This browser does not support microphone input.");
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      const chunks=[];
      let recorder=null;
      if(window.MediaRecorder){
        const mime=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(type=>MediaRecorder.isTypeSupported?.(type));
        recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
        recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
        recorder.start(1000);
      }
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      const context=AudioContextClass?new AudioContextClass():null;
      const analyser=context?context.createAnalyser():null;
      const source=context?context.createMediaStreamSource(stream):null;
      const buffer=analyser?new Float32Array(analyser.fftSize):null;
      if(analyser){analyser.fftSize=4096;analyser.smoothingTimeConstant=0.15;source.connect(analyser);}
      const state={stream,recorder,chunks,context,analyser,buffer,raf:0,currentMidi:null,lastDetection:0,assisted};
      captureRef.current=state;
      setCaptureAvailable(Boolean(recorder));
      setCaptureMessage(recorder?"Recording this practice session. Microphone audio stays in this browser until the session ends.":"Microphone listening is on, but this browser cannot record audio.");
      if(assisted&&analyser){
        const sample=()=>{
          if(captureRef.current!==state)return;
          analyser.getFloatTimeDomainData(buffer);
          let energy=0;for(let i=0;i<buffer.length;i++)energy+=buffer[i]*buffer[i];
          const rms=Math.sqrt(energy/buffer.length);
          setCaptureLevel(Math.min(100,Math.round(rms*450)));
          const frequency=rms>0.006?estimateFrequency(buffer,context.sampleRate):null;
          const now=performance.now();
          if(frequency&&frequency>65&&frequency<1400){
            const midi=Math.round(69+12*Math.log2(frequency/440));
            if(midi>=21&&midi<=108&&now-state.lastDetection>90){
              state.lastDetection=now;
              if(state.currentMidi!==midi){
                if(state.currentMidi!==null)micInputRef.current?.noteUp?.(state.currentMidi);
                state.currentMidi=midi;
                micInputRef.current?.noteDown?.(midi);
              }
            }
          }else if(state.currentMidi!==null&&now-state.lastDetection>220){
            micInputRef.current?.noteUp?.(state.currentMidi);state.currentMidi=null;
          }
          state.raf=requestAnimationFrame(sample);
        };
        state.raf=requestAnimationFrame(sample);
        setCaptureMessage("Microphone is listening locally for individual pitches. MIDI is recommended for chords.");
      }
      return true;
    }catch(error){
      setCaptureAvailable(false);
      setCaptureMessage(error.message||"Microphone permission was not granted. You can still use an attached MIDI keyboard or computer keys.");
      return false;
    }
  }

  async function stopCapture() {
    const state=captureRef.current;
    if(!state)return null;
    captureRef.current=null;
    if(state.raf)cancelAnimationFrame(state.raf);
    if(state.currentMidi!==null)micInputRef.current?.noteUp?.(state.currentMidi);
    let blob=null;
    if(state.recorder&&state.recorder.state!=="inactive"){
      blob=await new Promise(resolve=>{
        state.recorder.addEventListener("stop",()=>resolve(state.chunks.length?new Blob(state.chunks,{type:state.recorder.mimeType||"audio/webm"}):null),{once:true});
        state.recorder.stop();
      });
    }else if(state.chunks.length)blob=new Blob(state.chunks,{type:state.recorder?.mimeType||"audio/webm"});
    state.stream.getTracks().forEach(track=>track.stop());
    try{await state.context?.close();}catch{}
    setCaptureLevel(0);
    return blob;
  }

  async function saveRecording(blob) {
    if(!blob||blob.size<1024)return null;
    const extension=blob.type.includes("mp4")?"m4a":"webm";
    const recordingType=extension==="m4a"?"audio/mp4":"audio/webm";
    const file=new File([blob],"practice-recording-"+new Date().toISOString().replace(/[:.]/g,"-")+"."+extension,{type:recordingType});
    try{
      const signed=await api("/api/uploads/sign",{method:"POST",body:{filename:file.name,contentType:file.type||"audio/webm",size:file.size,purpose:"library",category:"recordings"}});
      const put=await fetch(signed.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type||"audio/webm"},body:file});
      if(!put.ok)throw new Error("Recording upload failed.");
      const completed=await api("/api/uploads/complete",{method:"POST",body:{fileId:signed.fileId,purpose:"library"}});
      return completed.file?.id||null;
    }catch(error){setCaptureMessage("The session was saved, but its recording could not be added to your library: "+error.message);return null;}
  }

  async function startSession(){
    if(session||busy)return;
    setBusy(true);setScoreLoadError("");
    try{
      const body=await api("/api/practice/start",{method:"POST",body:{
        mode:config.mode,taskId:config.task?.id||null,sectionKey:config.sectionKey,
        referenceFileId:config.referenceFile?.id||null,practiceType:config.practiceType,
      }});
      setSession(body.session);
      sessionStartRef.current=Date.now();
      setElapsed(0);
      await beginCapture(config.mode==="assisted");
    }catch(error){setScoreLoadError(error.message||"The practice session could not be started.");}
    finally{setBusy(false);}
  }

  async function finishSession(engineSummary=null){
    if(endingRef.current||!session)return;
    endingRef.current=true;setBusy(true);
    try{
      const durationSeconds=Math.min(14400,Math.max(elapsed,Math.floor((Date.now()-sessionStartRef.current)/1000)));
      const blob=await stopCapture();
      const recordingFileId=await saveRecording(blob);
      const score=engineSummary&&Number.isFinite(engineSummary.score)?engineSummary.score:null;
      const feedbackPayload=engineSummary?{
        source:"assisted-engine",
        score:engineSummary.score,
        hits:engineSummary.hits,
        total:engineSummary.total,
        perfect:engineSummary.perfect,
        good:engineSummary.good,
        almost:engineSummary.almost,
        wrong:engineSummary.wrong,
        maxCombo:engineSummary.maxCombo,
        hands:engineSummary.hands,
        tempo:engineSummary.tempo,
        trouble:engineSummary.trouble||[],
      }:null;
      const saved=await api("/api/practice/finish",{method:"PATCH",body:{sessionId:session.id,durationSeconds,score,feedback:feedbackPayload,recordingFileId}});
      const result={
        session:saved.session,summary:engineSummary,durationSeconds:Number(saved.session?.duration_seconds ?? durationSeconds),recordingFileId,
        task:config.task,sectionKey:config.sectionKey,mode:config.mode,
        recordingSaved:Boolean(recordingFileId),
      };
      onComplete(result);
    }catch(error){
      setScoreLoadError(error.message||"We couldn't save this practice session.");
      setBusy(false);endingRef.current=false;
    }
  }

  useEffect(()=>()=>{stopCapture().catch(()=>{});},[]);
  const file=config.referenceFile;
  const xmlReady=Boolean(xml);
  const isXml=file&&isMusicXml(file);
  
  const elapsedLabel=String(Math.floor(elapsed/60)).padStart(2,"0")+":"+String(elapsed%60).padStart(2,"0");

  return <div className="pc-live-session">
    <header className="pc-session-top"><div><button className="pc-back-link" onClick={onExit} disabled={Boolean(session)}>← Back</button><span className="pc-eyebrow">{config.mode==="assisted"?"ASSISTED PRACTICE":"STANDARD PRACTICE"}</span><h1>{config.task?.title||file?.original_name||"Free practice"}</h1><p>{config.sectionKey==="full"?"Whole task":config.sectionKey.replace("section-","Section ")}</p></div><div className="pc-session-top-right"><span className="pc-session-clock">{elapsedLabel}</span>{session&&<button className="pc-button dark" onClick={()=>{if(config.mode==="assisted"&&engineControlRef.current?.finish)engineControlRef.current.finish();else finishSession(null);}} disabled={busy}>{busy?"Saving session…":"Stop Session ■"}</button>}</div></header>
    {!session ? <section className="pc-session-ready"><span className="pc-session-ready-icon">♫</span><h2>Take a moment to settle in.</h2><p>Your session will be recorded when you begin. Microphone input is optional, and you can connect a MIDI piano for more accurate note detection.</p>
      {config.mode==="assisted"&&<div className="pc-inline-warning">Assisted mode will use the score's note timings. Use an external MIDI keyboard for accurate chords; microphone pitch detection is monophonic.</div>}
      {scoreLoadError&&<p className="pc-form-error">{scoreLoadError}</p>}
      <button className="pc-button dark" onClick={startSession} disabled={busy||(config.mode==="assisted"&&!xmlReady)}>{busy?"Starting…":"Start session ↗"}</button>
      {config.mode==="assisted"&&!xmlReady&&<small>{scoreLoadError||"Preparing the MusicXML score…"}</small>}
    </section> : <div className="pc-session-stage">
      <div className="pc-session-status"><span className="pc-recording-dot"/><span>Session in progress · {captureMessage}{currentBar?" · Bar "+currentBar:""}</span><span className="pc-input-level"><i style={{width:captureLevel+"%"}}/></span></div>
      {config.mode==="assisted"&&xmlReady ? <Suspense fallback={<div className="pc-inline-status">Preparing your falling-note lesson…</div>}>
        <KeystoneLearnEngine xml={xml} bpm={120} title={config.task?.title||file?.original_name||"Your piece"} micInputRef={micInputRef} microphoneListening={Boolean(captureRef.current)} microphoneLevel={captureLevel} microphoneStatus={captureMessage} onProgress={setCurrentBar} onReady={handle=>{engineControlRef.current=handle;}} onFinish={finishSession} onClose={()=>{if(engineControlRef.current?.finish)engineControlRef.current.finish();else finishSession(null);}}/>
      </Suspense> : config.mode==="standard"&&file&&isPdf(file) ? <PracticePdf file={file} /> :
      config.mode==="standard"&&xmlReady ? <Suspense fallback={<div className="pc-inline-status">Rendering the score…</div>}><MusicXMLViewer xml={xml} title={file.original_name}/></Suspense> :
      <div className="pc-practice-no-score"><span>𝄞</span><h2>Practise at your own pace.</h2><p>{scoreLoadError||"Use your own sheet music or upload a score to see it alongside your session."}</p></div>}
      {config.mode==="standard"&&<div className="pc-standard-note"><strong>Standard Practice</strong><span>The session timer and recording are active. Bar-by-bar detection for this document requires score-recognition alignment.</span></div>}
      {scoreLoadError&&<p className="pc-form-error">{scoreLoadError}</p>}
    </div>}
    <footer className="pc-session-footer"><span>{config.mode==="assisted"?"Follow the falling notes and play without rushing.":"Play through the music at a comfortable pace."}</span><span>15 minutes of practice earns today's streak.</span></footer>
  </div>;
}

function estimateFrequency(buffer,sampleRate){
  const size=buffer.length;
  let mean=0;for(let i=0;i<size;i++)mean+=buffer[i];mean/=size;
  let rms=0;for(let i=0;i<size;i++){const value=buffer[i]-mean;rms+=value*value;}
  rms=Math.sqrt(rms/size);if(rms<0.005)return null;
  const minLag=Math.max(2,Math.floor(sampleRate/1400));
  const maxLag=Math.min(size/2,Math.floor(sampleRate/65));
  let bestLag=-1,best=-Infinity;
  for(let lag=minLag;lag<=maxLag;lag++){
    let correlation=0;
    for(let i=0;i<size-maxLag;i++)correlation+=(buffer[i]-mean)*(buffer[i+lag]-mean);
    if(correlation>best){best=correlation;bestLag=lag;}
  }
  if(bestLag<0)return null;
  const confidence=best/(best+1e-9);
  return confidence<0.05?null:sampleRate/bestLag;
}

function PracticePdf({file}){
  const [url,setUrl]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;api("/api/uploads/download?id="+encodeURIComponent(file.id)+"&inline=1").then(result=>{if(active)setUrl(result.url);}).catch(reason=>{if(active)setError(reason.message);});return()=>{active=false;};},[file.id]);
  if(error)return <div className="pc-inline-error">{error}</div>;
  if(!url)return <div className="pc-inline-status">Opening your sheet music…</div>;
  return <div className="pc-practice-pdf"><iframe title={file.original_name} src={url}/></div>;
}

function FeedbackPage({feedback,onBack,onAgain,onOpenFile}){
  const [audioUrl,setAudioUrl]=useState("");
  const [activeMistake,setActiveMistake]=useState(0);
  const summary=feedback.summary;
  const mistakes=summary?.trouble||[];
  useEffect(()=>{
    let active=true;
    if(!feedback.recordingFileId)return;
    api("/api/uploads/download?id="+encodeURIComponent(feedback.recordingFileId)+"&inline=1").then(result=>{if(active)setAudioUrl(result.url);}).catch(()=>{});
    return()=>{active=false;};
  },[feedback.recordingFileId]);
  function move(delta){setActiveMistake(index=>Math.max(0,Math.min(mistakes.length-1,index+delta)));}
  return <div className="pc-feedback-page">
    <div className="pc-feedback-heading"><button className="pc-back-link" onClick={onBack}>← Back to practice</button><span className="pc-eyebrow">SESSION COMPLETE</span><h1>A little more progress<em>.</em></h1><p>{feedback.task?.title||"Your practice session"} · {formatDuration(feedback.durationSeconds)} recorded</p></div>
    <section className="pc-feedback-written"><div><span className="pc-eyebrow">YOUR SESSION</span><h2>{summary?"Your assisted practice result":"Your practice has been saved."}</h2><p>{summary?"You matched "+summary.hits+" of "+summary.total+" expected notes in the selected passage. Use the practice areas below to decide what to revisit.":"Your session time has been saved to your practice history. This document did not provide note-level analysis, so no accuracy score or mistake claims have been generated."}</p></div>{summary&&<div className="pc-feedback-score"><strong>{summary.score}%</strong><small>SESSION SCORE</small></div>}</section>
    <section className="pc-feedback-recordings"><div className="pc-section-heading"><div><span className="pc-eyebrow">RECORDING</span><h2>Listen back to your session</h2></div></div>
      {audioUrl?<audio controls preload="metadata" src={audioUrl}/> : <p>{feedback.recordingSaved?"Your recording is saved in Sheet Music collection.":"No audio recording was saved for this session."}</p>}
      <small>The current recording is the full session. Separate mistake clips require the audio-analysis worker.</small>
    </section>
    <section className="pc-feedback-mistakes"><div className="pc-section-heading"><div><span className="pc-eyebrow">PRACTICE AREAS</span><h2>Places to revisit</h2></div>{mistakes.length>0&&<div className="pc-mistake-nav"><button onClick={()=>move(-1)} disabled={activeMistake===0} aria-label="Previous mistake">←</button><span>{activeMistake+1} / {mistakes.length}</span><button onClick={()=>move(1)} disabled={activeMistake===mistakes.length-1} aria-label="Next mistake">→</button></div>}</div>
      {mistakes.length ? <div className="pc-mistake-list">{mistakes.map((item,index)=><button key={item.bar+"-"+index} className={activeMistake===index?"active":""} onClick={()=>setActiveMistake(index)}><span className="pc-mistake-number">{String(index+1).padStart(2,"0")}</span><span><strong>Bar {item.bar}</strong><small>{(item.notes||[]).join(" · ")||"Revisit this passage"}</small></span><b>↗</b></button>)}</div> : <p>{summary?"No specific trouble bars were returned by the practice engine.":"Once a score-analysis service is connected, detected mistake locations will appear here."}</p>}
      {mistakes.length>0&&<div className="pc-active-mistake"><strong>Focus on bar {mistakes[activeMistake]?.bar}</strong><p>{(mistakes[activeMistake]?.notes||[]).join(", ")}</p><small>The current engine reports bars and notes; aligned score highlighting and separate audio clips need score/audio alignment data.</small></div>}
    </section>
    <div className="pc-feedback-footer"><button className="pc-button outline" onClick={onBack}>Back to practice</button><button className="pc-button dark" onClick={onAgain}>Start another session ↗</button></div>
  </div>;
}

function ProfilePage({data,onSaved,toast,onRefresh}){
  const user=data.user||{},initialPrefs=data.preferences||{};
  const [displayName,setDisplayName]=useState(user.display_name||auth.currentUser?.displayName||"");
  const [preferredName,setPreferredName]=useState(user.preferred_name||"");
  const [targetDate,setTargetDate]=useState(user.target_date?String(user.target_date).slice(0,10):"");
  const [notationStyle,setNotationStyle]=useState(initialPrefs.notation_style||"standard");
  const [theme,setTheme]=useState(initialPrefs.theme||"light");
  const [fontSize,setFontSize]=useState(initialPrefs.font_size||"normal");
  const [remindersEmail,setRemindersEmail]=useState(initialPrefs.reminders_email??true);
  const [remindersBrowser,setRemindersBrowser]=useState(initialPrefs.reminders_browser??false);
  const [reminderSchedule,setReminderSchedule]=useState(initialPrefs.reminder_schedule||[]);
  const [timezone,setTimezone]=useState(initialPrefs.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [saving,setSaving]=useState(false);
  const [password,setPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [passwordBusy,setPasswordBusy]=useState(false);
  const [accountMessage,setAccountMessage]=useState("");
  const [interfaceOpen,setInterfaceOpen]=useState(false);
  const [scheduleEnabled,setScheduleEnabled]=useState(false);
  const [checkoutPlan,setCheckoutPlan]=useState(user.plan==="pro"?"pro":"basic");
  const [checkoutSecret,setCheckoutSecret]=useState("");
  const plan=user.plan||"free";
  const connected=(auth.currentUser?.providerData||[]).map(provider=>provider.providerId);
  async function saveProfile(event){
    event.preventDefault();setSaving(true);setAccountMessage("");
    try{
      await api("/api/profile",{method:"PATCH",body:{
        displayName,preferredName,targetDate,
        preferences:{notationStyle,theme,fontSize,remindersEmail,remindersBrowser,reminderSchedule,timezone},
      }});
      if(displayName&&auth.currentUser?.displayName!==displayName)await updateProfile(auth.currentUser,{displayName});
      await onSaved();
    }catch(error){setAccountMessage(error.message||"Your profile could not be saved.");}
    finally{setSaving(false);}
  }
  async function changePassword(event){
    event.preventDefault();setPasswordBusy(true);setAccountMessage("");
    try{
      const current=auth.currentUser;
      const emailProvider=connected.includes("password");
      if(emailProvider){
        if(!password)throw new Error("Enter your current password to confirm this change.");
        const credential=EmailAuthProvider.credential(current.email,password);
        await reauthenticateWithCredential(current,credential);
      }else if(googleProvider){await reauthenticateWithPopup(current,googleProvider);}
      if(newPassword.length<8||!/[A-Z]/.test(newPassword)||!/[a-z]/.test(newPassword)||!/[0-9]/.test(newPassword))throw new Error("Use at least 8 characters, including uppercase, lowercase and a number.");
      await updatePassword(current,newPassword);
      setPassword("");setNewPassword("");setAccountMessage("Your password has been changed.");
    }catch(error){setAccountMessage(error.message||"The password could not be changed.");}
    finally{setPasswordBusy(false);}
  }
  async function openPortal(){
    try{const result=await api("/api/billing/portal",{method:"POST"});window.location.assign(result.url);}
    catch(error){setAccountMessage(error.message||"Billing management could not be opened.");}
  }
  async function startCheckout(){
    try{
      const selected=checkoutPlan;
      await api("/api/profile",{method:"PATCH",body:{examBoard:user.exam_board,grade:user.grade,plan:selected,interval:"monthly",targetDate,bookSources:Array.isArray(user.book_sources)?user.book_sources:[],examBookSkipped:!user.exam_book_file_id}});
      const checkout=await api("/api/billing/checkout",{method:"POST",body:{plan:selected,interval:"monthly"}});
      setCheckoutSecret(checkout.clientSecret);
    }catch(error){setAccountMessage(error.message||"Checkout could not be opened.");}
  }
  function toggleDay(day){
    setReminderSchedule(current=>{
      const currentDay=current.find(item=>Number(item.day)===day);
      const next=current.filter(item=>Number(item.day)!==day);
      return [...next,{day,enabled:!currentDay?.enabled,times:currentDay?.times?.length?currentDay.times:["18:00"]}].sort((a,b)=>a.day-b.day);
    });
  }
  function addTime(day){
    setReminderSchedule(current=>current.map(item=>Number(item.day)===day?{...item,times:[...new Set([...(item.times||[]),"19:00"])].slice(0,8)}:item));
  }
  function setTime(day,index,time){
    setReminderSchedule(current=>current.map(item=>Number(item.day)===day?{...item,times:item.times.map((value,i)=>i===index?time:value)}:item));
  }
  return <div className="pc-profile-page">
    <div className="pc-welcome-row"><div><span className="pc-eyebrow">YOUR ACCOUNT</span><h1>Profile<em>.</em></h1><p>Your details and preferences, just how you like them.</p></div></div>
    <form className="pc-profile-form" onSubmit={saveProfile}>
      <section className="pc-panel pc-profile-section"><span className="pc-eyebrow">01 · PERSONAL DETAILS</span><div className="pc-profile-avatar-row"><span className="pc-avatar large">{(preferredName||displayName||"P").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()}</span><div><h2>{preferredName||displayName||"Piano student"}</h2><p>Student account</p></div></div>
        <div className="pc-profile-fields"><label>Name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} required/></label><label>Preferred name<input value={preferredName} onChange={e=>setPreferredName(e.target.value)} placeholder="What should we call you?"/></label><label>Email address<input value={user.email||auth.currentUser?.email||""} disabled/></label><label>Connected services<input value={connected.map(id=>id==="google.com"?"Google":id==="password"?"Email and password":id).join(" · ")||"No linked service"} disabled/></label><label>Grade and exam board<input value={[user.grade,user.exam_board].filter(Boolean).join(" · ")||"Not set"} disabled/></label><label>Target completion date<input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label></div>
      </section>
      <section className="pc-panel pc-profile-section"><span className="pc-eyebrow">02 · REMINDERS & NOTATION</span><h2>Make practice feel right.</h2><div className="pc-setting-line"><div><strong>Email reminders</strong><small>Choose this independently from browser notifications.</small></div><Toggle value={remindersEmail} onChange={setRemindersEmail}/></div><div className="pc-setting-line"><div><strong>Browser notifications</strong><small>Permission and delivery require the Web Push service to be configured.</small></div><Toggle value={remindersBrowser} onChange={setRemindersBrowser}/></div>
        <label className="pc-profile-label">Notation style<select value={notationStyle} onChange={e=>setNotationStyle(e.target.value)}><option value="standard">Standard notation</option><option value="closer">Closer-together spacing</option><option value="larger">Larger noteheads</option><option value="inverted">Inverted notation</option></select></label>
        <div className={"pc-notation-preview "+notationStyle}><span className="pc-eyebrow">NOTATION PREVIEW</span><div>𝄞　♩　♪　♫　♬　♩　𝄢　♬</div></div>
        <label className="pc-profile-label">Your timezone<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value={timezone}>{timezone}</option>{["Europe/London","Europe/Paris","America/New_York","America/Los_Angeles","Asia/Kolkata","Australia/Sydney"].filter(item=>item!==timezone).map(item=><option key={item}>{item}</option>)}</select></label>
        <div className="pc-setting-line"><div><strong>Reminder schedule</strong><small>Set individual days and multiple times. Your preferences are saved; delivery service is not connected yet.</small></div><button type="button" className="pc-small-button" onClick={()=>setScheduleEnabled(v=>!v)}>{scheduleEnabled?"Hide":"Edit schedule"}</button></div>
        {scheduleEnabled&&<div className="pc-reminder-days">{WEEKDAYS.map((day,index)=>{const item=reminderSchedule.find(entry=>Number(entry.day)===index);return <div className="pc-reminder-day" key={day}><label><input type="checkbox" checked={Boolean(item?.enabled)} onChange={()=>toggleDay(index)}/>{day}</label>{item?.enabled&&<div>{(item.times||[]).map((time,i)=><input aria-label={day+" reminder time"} key={i} type="time" value={time} onChange={e=>setTime(index,i,e.target.value)}/>)}<button type="button" onClick={()=>addTime(index)}>＋ Time</button></div>}</div>;})}</div>}
      </section>
      <section className="pc-panel pc-profile-section"><button type="button" className="pc-collapse-head" onClick={()=>setInterfaceOpen(v=>!v)}><span><span className="pc-eyebrow">03 · INTERFACE SETTINGS</span><strong>Accessibility and appearance</strong></span><b>{interfaceOpen?"−":"＋"}</b></button>
        {interfaceOpen&&<div className="pc-interface-settings"><label>Appearance<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="contrast">High contrast</option></select></label><label>Text size<select value={fontSize} onChange={e=>setFontSize(e.target.value)}><option value="normal">Standard</option><option value="large">Large</option><option value="xlarge">Extra large</option></select></label><p>Changes are applied in this browser and saved with your profile.</p></div>}
      </section>
      <section className="pc-panel pc-profile-section"><span className="pc-eyebrow">04 · SECURITY</span><h2>Change password</h2><div className="pc-profile-fields"><label>Current password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder={connected.includes("password")?"Current password":"Not needed for Google sign-in"}/></label><label>New password<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password"/></label></div><button type="button" className="pc-button outline" disabled={passwordBusy||!newPassword} onClick={changePassword}>{passwordBusy?"Updating…":"Update password"}</button><p className="pc-muted-small">At least 8 characters, including uppercase, lowercase and a number.</p></section>
      <section className="pc-panel pc-profile-section pc-delete-note"><span className="pc-eyebrow">05 · ACCOUNT DELETION</span><h2>Leaving Piano Coach?</h2><p>Account deletion must verify your identity, cancel an active subscription and provide a 15-day period in which you can cancel the request. That deletion workflow is not connected yet, so this control is deliberately not presented as active.</p><button type="button" disabled className="pc-button danger" title="Account deletion workflow is not connected">Account deletion unavailable</button></section>
      <section className="pc-panel pc-profile-section"><span className="pc-eyebrow">06 · SUBSCRIPTION</span><div className="pc-billing-heading"><div><h2>{plan==="pro"?"Piano Coach Pro":plan==="basic"?"Piano Coach Basic":"Free demo"}</h2><p>{plan==="pro"?"£19.99 per month":plan==="basic"?"£9.99 per month":"60 lifetime practice minutes"}</p></div><span className="pc-plan-tag">{String(user.subscription_status||"free").replace("_"," ").toUpperCase()}</span></div>
        {user.stripe_customer_id?<button type="button" className="pc-button outline" onClick={openPortal}>Manage subscription ↗</button>:<div className="pc-upgrade-row"><label>Choose plan<select value={checkoutPlan} onChange={e=>setCheckoutPlan(e.target.value)}><option value="basic">Basic · £9.99/month</option><option value="pro">Pro · £19.99/month</option></select></label><button type="button" className="pc-button dark" onClick={startCheckout}>Continue to Stripe ↗</button></div>}
        <p className="pc-muted-small">Monthly plan changes and cancellation are managed securely through Stripe. Annual changes need to be handled at renewal.</p>
      </section>
      {accountMessage&&<p className="pc-form-error" role="alert">{accountMessage}</p>}
      <div className="pc-profile-save"><button className="pc-button dark" disabled={saving}>{saving?"Saving…":"Save profile and preferences"}</button></div>
    </form>
  </div>;
}


function CheckoutModal({clientSecret,onClose}){
  const mountRef=useRef(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true,checkout=null;
    async function mount(){
      try{
        const {loadStripe}=await import("@stripe/stripe-js");
        const stripe=await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
        if(!stripe)throw new Error("Stripe could not be loaded. Check the publishable key.");
        checkout=await stripe.initEmbeddedCheckout({clientSecret});
        if(active&&mountRef.current){checkout.mount(mountRef.current);setLoading(false);}
      }catch(reason){if(active){setError(reason.message||"Secure checkout could not be opened.");setLoading(false);}}
    }
    mount();
    return()=>{active=false;try{checkout?.destroy();}catch{}};
  },[clientSecret]);
  return <div className="pc-overlay pc-checkout-overlay"><section className="pc-modal pc-checkout-modal"><button className="pc-modal-close" onClick={onClose}>×</button><span className="pc-eyebrow">SECURE CHECKOUT</span><h2>Complete your subscription.</h2>{loading&&<p>Preparing secure checkout…</p>}{error&&<p className="pc-form-error">{error}</p>}<div ref={mountRef}/></section></div>;
}

function Toggle({value,onChange}){return <button type="button" role="switch" aria-checked={value} className={"pc-toggle "+(value?"on":"")} onClick={()=>onChange(!value)}><i/></button>;}
