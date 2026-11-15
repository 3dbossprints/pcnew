import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmailAuthProvider, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signOut, updatePassword, updateProfile } from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase.js";
import { buildKeystoneTimeline, parseKeystoneMusicXML } from "./keystone-engine.js";
import { searchScales } from "./scale-library.js";
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
  // Recency-weighted average: most recent attempts count more, so one
  // unusually good early attempt cannot permanently lock in a high score.
  const weights = chosen.map((_, i) => Math.pow(0.75, i));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  return chosen.reduce((sum, item, i) => sum + Number(item.score) * weights[i], 0) / totalWeight;
}
function taskProgress(task, attempts) {
  const sectionCount = Number(task.section_count) || 1;
  const scores = Array.from({ length: sectionCount }, (_, index) => sectionScore(task, attempts, index + 1));
  // Only count sections that have been practised; unpractised sections
  // don't drag the average down but also don't count as 100%.
  const practised = scores.filter(value => value !== null);
  if (!practised.length) return 0;
  const total = practised.reduce((sum, value) => sum + value, 0);
  // Proportional: each section contributes equally, but unpractised
  // sections reduce the overall score proportionally.
  return Math.round((total / sectionCount) * (practised.length / sectionCount) + (total / practised.length) * (1 - practised.length / sectionCount) * 0.5);
}
function taskHasProgress(task, attempts) {
  return getTaskAttempts(task, attempts).some(item => item.score !== null);
}
function getTaskFile(task, files) {
  return files.find(file => file.id === task.source_file_id) || null;
}
function recommendNextTask(tasks, attempts) {
  const scored = tasks.map(task => {
    const related = getTaskAttempts(task, attempts);
    const lastAttempted = related.length ? new Date(related[0].attempted_at).getTime() : 0;
    const progress = taskProgress(task, attempts);
    const lowSections = Array.from({ length: Number(task.section_count) || 1 }, (_, index) => sectionScore(task, attempts, index + 1))
      .filter(score => score !== null && score < 80).length;
    return { task, lastAttempted, progress, lowSections, priority: lowSections * 10 + (100 - progress) - (Date.now() - lastAttempted) / 86400000 };
  });
  scored.sort((a, b) => b.priority - a.priority);
  return scored.filter(item => item.lastAttempted > 0 || item.task).slice(0, 3).map(item => item.task);
}
function Icon({ children, className = "" }) { return <span className={"pc-icon " + className} aria-hidden="true">{children}</span>; }
function formatPromoCodeInput(value) { const code = String(value || "").replace(/\s+/g, "").toUpperCase(); return /^[A-Z0-9]{0,8}$/.test(code) && code.length > 4 ? code.slice(0, 4) + " " + code.slice(4) : code; }

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
  const checkoutConfirmationStarted = useRef(false);

  const refresh = useCallback(async () => {
    const [account, library] = await Promise.all([api("/api/me"), api("/api/uploads")]);
    setData(account);
    setFiles(library.files || []);
    return account;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const checkoutReturned = params.get("checkout") === "complete" && Boolean(sessionId);
    const portalReturned = params.get("billing") === "returned";
    if ((checkoutReturned || portalReturned) && !checkoutConfirmationStarted.current) {
      checkoutConfirmationStarted.current = true;
      api("/api/billing/confirm", { method: "POST", body: checkoutReturned ? { sessionId } : {} })
        .then(async result => {
          if (result.confirmed) {
            const cleanUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, "", cleanUrl);
            const account = await api("/api/me");
            setData(account);
            setNotice("Your subscription has been confirmed and your account has been updated.");
            setNoticeType("success");
          } else if (result.pending) {
            setNotice(result.message || "Stripe is still confirming your subscription. Your account will update shortly.");
            setNoticeType("info");
          }
        })
        .catch(error => {
          setNotice(error.message || "We couldn't confirm your subscription yet. Please refresh your account shortly.");
          setNoticeType("error");
        });
    }
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

  if (loading) return <div className="pc-loading-screen"><img className="pc-loading-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><div className="pc-loading-copy">Preparing your musical space</div><div className="pc-loading-track"><i /></div></div>;
  if (loadError) return <div className="pc-loading-screen"><img className="pc-loading-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><h1>Your account needs attention.</h1><p>{loadError}</p><button className="pc-button primary" onClick={() => window.location.reload()}>Try again</button></div>;

  return <div className="pc-app">
    <aside className="pc-sidebar">
      <div className="pc-brand"><img className="pc-brand-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><small>YOUR MUSICAL JOURNEY</small></div>
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
        {page === "home" && !selectedTask && <Dashboard data={data} displayName={displayName} tasks={tasks} attempts={attempts} files={files} onOpenTask={setSelectedTask} onAddTask={category => setTaskEditor({ ...blankTask, category })} onOpenLibrary={() => setShowLibrary(true)} onOpenFile={openFile} onPractice={beginPractice} freeLocked={freeLocked} onRefresh={refresh}/>}
        {page === "home" && selectedTask && <TaskDetails task={selectedTask} attempts={attempts} files={files} onBack={() => setSelectedTask(null)} onPractice={beginPractice} onEdit={() => setTaskEditor({ ...blankTask, ...selectedTask, sourceFileId: selectedTask.source_file_id || "" })} onDelete={deleteTask} onOpenFile={openFile}/>}
        {page === "practice" && <PracticeHub tasks={tasks} files={files} attempts={attempts} plan={plan} hasExamBook={hasExamBook} freeLocked={freeLocked} config={practiceConfig} onStart={beginPractice} onOpenFile={openFile} onReturn={() => { setPracticeConfig(null); setFeedback(null); setPage("home"); }} feedback={feedback} setFeedback={setFeedback} toast={toast} refresh={refresh}/>}
        {page === "profile" && <ProfilePage data={data} onSaved={async () => { await refresh(); toast("Your profile has been saved."); }} toast={toast} onRefresh={refresh}/>}
      </div>
    </main>

    {taskEditor && <TaskEditor draft={taskEditor} files={files.filter(file => file.kind === "sheet" && !isEpub(file))} busy={profileBusy} user={user} onClose={() => setTaskEditor(null)} onSave={saveTask}/>}
    {showLibrary && <LibraryModal files={files} busy={documentBusy} onClose={() => setShowLibrary(false)} onOpen={openFile} onUpload={uploadFile} onRefresh={refresh} toast={toast} plan={plan}/>}
    {openedDocument && <Suspense fallback={<div className="pc-modal-loading">Opening your music…</div>}>
      {openedDocument.xml ? <div className="pc-doc-modal"><header><div><span className="pc-eyebrow">SHEET MUSIC</span><strong>{openedDocument.file.original_name}</strong></div><button onClick={() => setOpenedDocument(null)}>Close ×</button></header><MusicXMLViewer xml={openedDocument.xml} title={openedDocument.file.original_name}/></div> :
        <DocumentViewer file={openedDocument.file} url={openedDocument.url} getToken={() => auth.currentUser.getIdToken()} onClose={() => setOpenedDocument(null)} onUseForPractice={(file) => { setOpenedDocument(null); beginPractice(null,"full","standard",file.metadata?.purpose === "personal_piece" ? "personal" : "graded",file); }}/>}
    </Suspense>}
    {notice && <div className={"pc-toast " + noticeType} role="status"><span>{noticeType === "error" ? "!" : "✓"}</span>{notice}</div>}
  </div>;
}

function Dashboard({ data, displayName, tasks, attempts, files, onOpenTask, onAddTask, onOpenLibrary, onOpenFile, onPractice, freeLocked }) {
  const user = data?.user || {};
  const summary = data?.practiceSummary || {};
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const todaySeconds = Number(summary.todaySeconds || 0);
  const remaining = Math.max(0, 900 - todaySeconds);
  const categories = CATEGORIES.map(category => ({ ...category, tasks: tasks.filter(task => task.category === category.id) }));
  const avg = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + taskProgress(task, attempts), 0) / tasks.length) : null;
  const recommendations = recommendNextTask(tasks, attempts).filter(task => taskHasProgress(task, attempts));
  const nextTask = recommendations[0] || null;
  const examDate = user.target_date ? formatDate(user.target_date) : "Not set";
  const sheetMusicFiles = files.filter(file => file.kind === "sheet" && file.metadata?.purpose !== "exam_book");
  return <div className="pc-dashboard">
    <div className="pc-dash-header">
      <div className="pc-dash-greeting"><span className="pc-eyebrow">{today.toUpperCase()}</span><h1>{greeting}, {displayName.split(" ")[0]}</h1><p>{[user.grade, user.exam_board].filter(Boolean).join(" · ") || "Your musical journey starts here."}</p></div>
      <div className="pc-dash-actions">
        <button className="pc-button primary" onClick={() => onPractice(null)}>Start practice <span>→</span></button>
        <button className="pc-button outline" onClick={onOpenLibrary}>Sheet music</button>
      </div>
    </div>
    <section className="pc-dashboard-summary" aria-label="Your progress">
      <div className="pc-dashboard-summary-item"><span>OVERALL PROGRESS</span><strong>{avg === null ? "—" : avg + "%"}</strong><small>{tasks.length ? tasks.length + " learning tasks" : "Add your first learning task"}</small></div>
      <div className="pc-dashboard-summary-item"><span>DAILY STREAK</span><strong>{Number(summary.streakDays || 0)} days</strong><small>{remaining ? formatDuration(remaining) + " to your 15-minute goal" : "15-minute goal reached today"}</small></div>
      <div className="pc-dashboard-summary-item"><span>TARGET EXAM DATE</span><strong className="pc-dashboard-date">{examDate}</strong><small>{user.target_date ? "Your planned completion date" : "Add a date in your profile"}</small></div>
    </section>
    {freeLocked && <div className="pc-notice-banner"><strong>Your free practice hour has been used.</strong><span>Your progress and account remain here. Choose a plan from Profile to continue learning.</span></div>}
    {user.plan !== "free" && !user.exam_book_file_id && <div className="pc-notice-banner"><strong>Upload your exam-board ebook.</strong><span>Add your own exam-board PDF or EPUB to your sheet music collection to unlock graded learning.</span></div>}
    {nextTask && <button className="pc-next-task" onClick={() => onOpenTask(nextTask)}><span><small>RECOMMENDED NEXT</small><strong>{nextTask.title}</strong></span><span className="pc-next-task-action">View task ↗</span></button>}
    <div className="pc-section-heading"><div><span className="pc-eyebrow">YOUR LEARNING PLAN</span><h2>Pieces, exercises & scales</h2></div></div>
    <div className="pc-learning-grid">
      {categories.map(category => <section className="pc-learning-card" key={category.id}>
        <header><span className="pc-category-icon">{category.icon}</span><div><h3>{category.title}</h3><p>{category.tasks.length ? category.tasks.length + " saved" : category.detail}</p></div><button aria-label={"Add " + category.title.toLowerCase()} onClick={() => onAddTask(category.id)}>＋</button></header>
        {category.tasks.length ? <div className="pc-task-list">{category.tasks.slice(0,4).map(task => <TaskRow key={task.id} task={task} attempts={attempts} onClick={() => onOpenTask(task)}/>)}
          {category.tasks.length > 4 && <button className="pc-text-link" onClick={() => onOpenTask(category.tasks[4])}>View all {category.tasks.length} →</button>}
        </div> : <div className="pc-empty-category"><span>＋</span><p>No {category.title.toLowerCase()} added yet.</p><button onClick={() => onAddTask(category.id)}>Add your first {category.title.slice(0,-1).toLowerCase()}</button></div>}
      </section>)}
    </div>
  </div>;
}

function TaskRow({ task, attempts, onClick }) {
  const progress = taskProgress(task, attempts);
  const hasProgress = taskHasProgress(task, attempts);
  return <button className="pc-task-row" onClick={onClick}><span className="pc-task-dot"/><span className="pc-task-name"><strong>{task.title}</strong><small>{task.composer || (task.section_count > 1 ? task.section_count + " sections" : "Learning task")}</small></span><span className="pc-task-score">{hasProgress ? progress + "%" : "—"}</span><span className="pc-row-arrow">↗</span></button>;
}

function TaskDetails({ task, attempts, files, onBack, onPractice, onEdit, onDelete, onOpenFile }) {
  const related = getTaskAttempts(task, attempts);
  const scored = related.filter(item => item.score !== null).slice(0, 30).reverse();
  const file = getTaskFile(task, files);
  const progress = taskProgress(task, attempts);
  const [scoreXml, setScoreXml] = useState("");
  const [scoreLoadError, setScoreLoadError] = useState("");
  const [activeMistake, setActiveMistake] = useState(0);
  const mistakeBars = Array.from(new Set(related.flatMap(item =>
    Array.isArray(item.feedback?.trouble) ? item.feedback.trouble.map(area => Number(area.bar)) : []
  ))).filter(bar => Number.isInteger(bar) && bar > 0).sort((a, b) => a - b);

  useEffect(() => {
    let active = true;
    setScoreXml("");
    setScoreLoadError("");
    if (!file || !isMusicXml(file)) return () => { active = false; };
    async function loadScore() {
      try {
        const link = await api("/api/uploads/download?id=" + encodeURIComponent(file.id) + "&inline=1");
        const response = await fetch(link.url);
        if (!response.ok) throw new Error("The score could not be opened from your collection.");
        const xml = await response.text();
        if (active) setScoreXml(xml);
      } catch (error) {
        if (active) setScoreLoadError(error.message || "The score could not be loaded.");
      }
    }
    loadScore();
    return () => { active = false; };
  }, [file?.id]);

  useEffect(() => { setActiveMistake(0); }, [task.id]);
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
    {task.category === "pieces" && file && <section className="pc-panel pc-piece-score-preview">
      <div className="pc-panel-heading">
        <div><span className="pc-eyebrow">YOUR REPERTOIRE</span><h2>Piece score</h2></div>
        {mistakeBars.length > 0 && <div className="pc-mistake-nav">
          <button type="button" onClick={() => setActiveMistake(index => Math.max(0, index - 1))} disabled={activeMistake === 0} aria-label="Previous mistake">←</button>
          <span>{activeMistake + 1} / {mistakeBars.length}</span>
          <button type="button" onClick={() => setActiveMistake(index => Math.min(mistakeBars.length - 1, index + 1))} disabled={activeMistake >= mistakeBars.length - 1} aria-label="Next mistake">→</button>
        </div>}
      </div>
      {isMusicXml(file) && (scoreXml
        ? <MusicXMLViewer xml={scoreXml} title={file.original_name} highlightMeasures={mistakeBars} focusMeasure={mistakeBars[activeMistake]}/>
        : <div className="pc-inline-status">{scoreLoadError || "Loading your score…"}</div>)}
      {!isMusicXml(file) && <div className="pc-linked-score"><span className="pc-file-icon">▤</span><div><strong>{file.original_name}</strong><small>Open the original score to read it. Bar highlights are available for supported MusicXML scores.</small></div><button className="pc-button outline" onClick={() => onOpenFile(file)}>Open sheet ↗</button></div>}
      {isMusicXml(file) && mistakeBars.length > 0 && <p className="pc-muted-small">Orange markers show recorded mistake areas. Use the arrows to move between them, or scroll through the score yourself.</p>}
    </section>}
    <section className="pc-panel pc-sections-panel"><div className="pc-panel-heading"><div><span className="pc-eyebrow">CHOOSE YOUR FOCUS</span><h2>Practice a section</h2></div></div>
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

function TaskEditor({ draft, files, busy, user, onClose, onSave }) {
  const [value,setValue] = useState(draft);
  const [error,setError] = useState("");
  const [libraryOpen,setLibraryOpen] = useState(false);
  const update=(key,next)=>setValue(current=>({...current,[key]:next}));
  function submit(event) {
    event.preventDefault();
    if (!value.title.trim()) { setError("Give this task a title."); return; }
    onSave(value);
  }
  return <>
    <div className="pc-overlay" role="presentation"><form className="pc-modal pc-task-editor" onSubmit={submit}>
    <button type="button" className="pc-modal-close" onClick={onClose}>×</button><span className="pc-eyebrow">YOUR LEARNING PLAN</span><h2>{value.id ? "Edit learning task" : "Add to your learning plan"}</h2><p>Choose what you want to work towards. You can change it at any time.</p>
    <label>Type<select value={value.category} onChange={e=>update("category",e.target.value)}><option value="pieces">Piece</option><option value="exercises">Exercise</option><option value="scales">Scale</option></select></label>
    {value.category==="scales"&&<div className="pc-scale-library-entry"><div><strong>Choose from the scale library</strong><small>Search scales, keys, contrary motion, arpeggios and advanced techniques.</small></div><button type="button" className="pc-button outline" onClick={()=>setLibraryOpen(true)}>Browse scale library ↗</button></div>}
    <label>Title<input value={value.title} maxLength={180} onChange={e=>update("title",e.target.value)} placeholder={value.category==="scales"?"Choose a scale or enter your own":"e.g. Sonatina in C, first movement"} required/></label>
    <label>Composer or short description<input value={value.composer || ""} maxLength={160} onChange={e=>update("composer",e.target.value)} placeholder="Optional"/></label>
    <label>Notes<textarea rows="3" value={value.notes || ""} onChange={e=>update("notes",e.target.value)} placeholder="What would you like to focus on?"/></label>
    <label>Linked sheet music<select value={value.sourceFileId || ""} onChange={e=>update("sourceFileId",e.target.value)}><option value="">No uploaded score</option>{files.map(file=><option key={file.id} value={file.id}>{file.original_name}</option>)}</select></label>
    <label>Number of practice sections<input type="number" min="1" max="100" value={value.sectionCount} onChange={e=>update("sectionCount",Math.max(1,Math.min(100,Number(e.target.value)||1)))}/><small>Use 1 if you want to practise the whole task as a single section.</small></label>
    {error&&<p className="pc-form-error">{error}</p>}
    <div className="pc-modal-actions"><button type="button" className="pc-button outline" onClick={onClose}>Cancel</button><button className="pc-button dark" disabled={busy}>{busy?"Saving…":"Save task"}</button></div>
  </form></div>
  {libraryOpen&&<ScaleLibraryModal user={user} onClose={()=>setLibraryOpen(false)} onChoose={scale=>{
    update("title",scale.title);
    update("composer","Scale library · "+scale.family);
    update("notes",[
      "Key: "+scale.key,"Type: "+scale.family,"Motion: "+scale.motion,
      "Hands: "+scale.hands,"Octaves: "+scale.octaves,"Level: "+scale.level,
      scale.examMatch?"Matched to your selected exam-board syllabus.":"General technique entry; check your current exam-board syllabus for exact requirements."
    ].join("\\n"));
    setLibraryOpen(false);
  }}/>}
  </>;
}

function ScaleLibraryModal({user,onClose,onChoose}) {
  const [query,setQuery]=useState("");
  const [group,setGroup]=useState("All");
  const plan=user?.plan||"free";
  const allResults=useMemo(()=>searchScales(query,user?.exam_board,user?.grade),[query,user?.exam_board,user?.grade]);
  const results=allResults.filter(item=>group==="All"||item.group===group);
  const groups=["All",...new Set(searchScales("",user?.exam_board,user?.grade).map(item=>item.group))];
  const matched=results.filter(item=>item.examMatch).length;
  const proOnlyCount=results.filter(item=>item.level==="Advanced").length;
  return <div className="pc-overlay pc-scale-overlay"><section className="pc-modal pc-scale-modal" role="dialog" aria-modal="true" aria-label="Scale library">
    <header className="pc-scale-heading"><div><span className="pc-eyebrow">PIANO TECHNIQUE LIBRARY</span><h2>Find a scale.</h2><p>{[user?.grade,user?.exam_board].filter(Boolean).join(" · ")||"Your exam path"} · Search the catalogue and add it to your Grade Plan.</p></div><button type="button" className="pc-modal-close" onClick={onClose} aria-label="Close scale library">×</button></header>
    <label className="pc-scale-search"><span>⌕</span><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search e.g. C♭ minor, E minor contrary motion, arpeggio…"/></label>
    <div className="pc-scale-filters">{groups.map(item=><button type="button" key={item} className={group===item?"active":""} onClick={()=>setGroup(item)}>{item}</button>)}</div>
    {matched>0?<p className="pc-scale-match-note">{matched} exact syllabus match{matched===1?"":"es"} for {user?.grade||"your grade"} {user?.exam_board||""} appear first.</p>:<p className="pc-scale-match-note">Your exam path is {user?.grade||"not set"} {user?.exam_board||""}. The catalogue below includes general technique references — add the ones your teacher or syllabus recommends.</p>}
    {plan!=="pro"&&proOnlyCount>0&&<p className="pc-scale-match-note">Advanced scales, modes and extended techniques are part of Piano Coach Pro. You can still browse them, but upgrading unlocks the full catalogue.</p>}
    <div className="pc-scale-results" role="list">{results.map(item=>{const isProOnly=item.level==="Advanced"&&plan!=="pro";return <button type="button" role="listitem" className={"pc-scale-result"+(isProOnly?" pro-locked":"")} key={item.id} onClick={()=>!isProOnly&&onChoose(item)} disabled={isProOnly}><span className="pc-scale-result-icon">♬</span><span className="pc-scale-result-copy"><strong>{item.title}</strong><small>{item.group} · {item.hands} · {item.octaves} octaves</small></span><span className="pc-scale-level">{item.level}</span>{item.examMatch&&<span className="pc-scale-match">Your syllabus</span>}{isProOnly&&<span className="pc-scale-pro-tag">PRO</span>}<b>{isProOnly?"🔒":"＋"}</b></button>;})}{!results.length&&<p className="pc-empty-category">No scales match that search. Try a key, scale type or motion.</p>}</div>
    <footer className="pc-scale-footer"><span>{results.length} results · Choose one to add it to your learning plan.</span><button type="button" className="pc-button outline" onClick={onClose}>Close</button></footer>
  </section></div>;
}

function LibraryModal({ files, busy, onClose, onOpen, onUpload, onRefresh, toast, plan }) {
  const [uploading,setUploading]=useState(false);
  const [category,setCategory]=useState("pieces");
  const [purpose,setPurpose]=useState("library");
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [activeTab,setActiveTab]=useState("all");
  const groups=[
    {id:"pieces",label:"Sheet music",filter:file=>file.kind==="sheet"&&file.metadata?.purpose!=="exam_book"},
    {id:"recordings",label:"Recordings",filter:file=>file.kind==="audio"},
    {id:"images",label:"Images",filter:file=>file.kind==="image"},
    {id:"books",label:"Exam ebook",filter:file=>file.metadata?.purpose==="exam_book"},
  ];
  const tabs=[{id:"all",label:"All"},...groups];
  const tabbedFiles=activeTab==="all"?files:files.filter(groups.find(group=>group.id===activeTab)?.filter||(()=>false));
  const filteredFiles=search.trim()?tabbedFiles.filter(file=>file.original_name.toLowerCase().includes(search.trim().toLowerCase())):tabbedFiles;
  const fileMatchesSearch=(file)=>!search.trim()||file.original_name.toLowerCase().includes(search.trim().toLowerCase());
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
    <div className="pc-library-toolbar">
      <label className="pc-scale-search pc-library-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by filename…"/></label>
      <div className="pc-scale-filters pc-library-tabs">{tabs.map(tab=><button type="button" key={tab.id} className={activeTab===tab.id?"active":""} onClick={()=>setActiveTab(tab.id)}>{tab.label}</button>)}</div>
    </div>
    <div className="pc-library-upload-row"><label className="pc-select-label"><span>Save under</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="pieces">Pieces</option><option value="exercises">Exercises</option><option value="scales">Scales</option><option value="recordings">Recordings</option><option value="other">Other</option></select></label>
      <label className="pc-select-label"><span>Collection</span><select value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="library">My library</option>{plan==="pro"&&<option value="personal_piece">Pro Extras</option>}</select></label>
      <label className="pc-button dark pc-upload-button">{uploading?"Uploading…":"＋ Add a file"}<input type="file" accept=".pdf,.epub,.xml,.musicxml,.mid,.midi,.png,.jpg,.jpeg,.mp3,.m4a,.mp4,.webm,.wav" disabled={uploading} onChange={e=>{upload(e.target.files[0]);e.target.value="";}}/></label>
    </div>
    {error&&<p className="pc-form-error" role="alert">{error}</p>}
    {activeTab==="all"&&!search.trim() ? <div className="pc-library-groups">{groups.map(group=>{const list=files.filter(group.filter);return <section key={group.id}><header><strong>{group.label}</strong><small>{list.length}</small></header>{list.length ? list.map(file=><div className="pc-file-row" key={file.id}><span className={"pc-file-icon "+(file.kind||"")}>{file.kind==="audio"?"◉":file.kind==="image"?"▧":isEpub(file)?"▤":"♫"}</span><button className="pc-file-info" onClick={()=>onOpen(file)}><strong>{file.original_name}</strong><small>{file.metadata?.purpose==="personal_piece"?"Pro Extras · ":""}{Math.max(1,Math.round(Number(file.size_bytes||0)/1024))} KB</small></button><button className="pc-file-open" onClick={()=>onOpen(file)}>Open ↗</button><button className="pc-file-delete" onClick={()=>remove(file)} aria-label={"Delete "+file.original_name}>×</button></div>):<p className="pc-file-empty">Nothing saved here yet.</p>}</section>;})}</div>
    : <div className="pc-library-search-results"><div className="pc-library-results-header"><span>{filteredFiles.length} {filteredFiles.length===1?"file":"files"}{search.trim()?" matching \""+search.trim()+"\"":""}</span></div>{filteredFiles.length ? filteredFiles.map(file=><div className="pc-file-row" key={file.id}><span className={"pc-file-icon "+(file.kind||"")}>{file.kind==="audio"?"◉":file.kind==="image"?"▧":isEpub(file)?"▤":"♫"}</span><button className="pc-file-info" onClick={()=>onOpen(file)}><strong>{file.original_name}</strong><small>{file.metadata?.purpose==="personal_piece"?"Pro Extras · ":""}{Math.max(1,Math.round(Number(file.size_bytes||0)/1024))} KB</small></button><button className="pc-file-open" onClick={()=>onOpen(file)}>Open ↗</button><button className="pc-file-delete" onClick={()=>remove(file)} aria-label={"Delete "+file.original_name}>×</button></div>):<p className="pc-file-empty">No files match your search.</p>}</div>}
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
  const standardEvents=useMemo(()=>{
    if(config.mode!=="standard"||!xml)return [];
    try{return buildKeystoneTimeline(parseKeystoneMusicXML(xml));}catch{return [];}
  },[config.mode,xml]);
  const standardCursorRef=useRef(0);
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
      const state={stream,recorder,chunks,context,analyser,buffer,raf:0,currentMidi:null,lastDetection:0,assisted,startedAt:performance.now()};
      captureRef.current=state;
      setCaptureAvailable(Boolean(recorder));
      setCaptureMessage(recorder?"Recording this practice session. Microphone audio stays in this browser until the session ends.":"Microphone listening is on, but this browser cannot record audio.");
      if(analyser){
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
                if(assisted){
                  if(state.currentMidi!==null)micInputRef.current?.noteUp?.(state.currentMidi);
                  state.currentMidi=midi;
                  micInputRef.current?.noteDown?.(midi);
                }else{
                  state.currentMidi=midi;
                  const cursor=standardCursorRef.current;
                  const limit=Math.min(standardEvents.length,cursor+18);
                  let match=-1;
                  for(let index=cursor;index<limit;index+=1){
                    if(standardEvents[index].midi===midi){match=index;break;}
                  }
                  if(match>=0){
                    standardCursorRef.current=match+1;
                    setCurrentBar(standardEvents[match].measure);
                  }
                }
              }
            }
          }else if(state.currentMidi!==null&&now-state.lastDetection>220){
            if(assisted)micInputRef.current?.noteUp?.(state.currentMidi);
            state.currentMidi=null;
          }
          state.raf=requestAnimationFrame(sample);
        };
        state.raf=requestAnimationFrame(sample);
        setCaptureMessage(assisted
        ? "Microphone is listening locally for individual pitches. MIDI is recommended for chords."
        : standardEvents.length
          ? "Listening locally for pitches and following recognised notes through your score. Chords may need a MIDI keyboard."
          : "Recording this session. This score has no MusicXML note timeline for bar following.");
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

  function encodeAudioRangeAsWav(audioBuffer,startSeconds,endSeconds) {
    const sampleRate=audioBuffer.sampleRate;
    const first=Math.max(0,Math.floor(startSeconds*sampleRate));
    const last=Math.min(audioBuffer.length,Math.floor(endSeconds*sampleRate));
    const frameCount=Math.max(0,last-first);
    const channels=audioBuffer.numberOfChannels;
    if(frameCount<1||channels<1)return null;
    const bytesPerSample=2,blockAlign=channels*bytesPerSample,dataBytes=frameCount*blockAlign;
    const output=new ArrayBuffer(44+dataBytes),view=new DataView(output);
    const writeText=(offset,value)=>{for(let i=0;i<value.length;i+=1)view.setUint8(offset+i,value.charCodeAt(i));};
    writeText(0,"RIFF");view.setUint32(4,36+dataBytes,true);writeText(8,"WAVE");
    writeText(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
    view.setUint16(22,channels,true);view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*blockAlign,true);view.setUint16(32,blockAlign,true);
    view.setUint16(34,16,true);writeText(36,"data");view.setUint32(40,dataBytes,true);
    let offset=44;
    const channelData=Array.from({length:channels},(_,channel)=>audioBuffer.getChannelData(channel));
    for(let frame=first;frame<last;frame+=1){
      for(let channel=0;channel<channels;channel+=1){
        const sample=Math.max(-1,Math.min(1,channelData[channel][frame]));
        view.setInt16(offset,sample<0?sample*0x8000:sample*0x7fff,true);offset+=2;
      }
    }
    return new Blob([output],{type:"audio/wav"});
  }

  async function saveMistakeClips(blob,trouble) {
    if(!blob||!Array.isArray(trouble)||!trouble.length)return [];
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return [];
    const decoder=new AudioContextClass();
    let decoded;
    try{
      decoded=await decoder.decodeAudioData(await blob.arrayBuffer());
    }catch(error){
      setCaptureMessage("The full recording was saved, but this browser could not create separate mistake clips: "+error.message);
      return [];
    }finally{try{await decoder.close();}catch{}}
    const areas=trouble.filter(item=>Number.isFinite(Number(item.timeSeconds))&&Number(item.bar)>0);
    const results=await Promise.all(areas.map(async item=>{
      const moment=Number(item.timeSeconds);
      const start=Math.max(0,moment-0.9),end=Math.min(decoded.duration,moment+1.8);
      if(end-start<0.45)return null;
      const clip=encodeAudioRangeAsWav(decoded,start,end);
      if(!clip||clip.size<1200)return null;
      const filename="mistake-bar-"+item.bar+"-"+Date.now()+".wav";
      try{
        const signed=await api("/api/uploads/sign",{method:"POST",body:{filename,contentType:"audio/wav",size:clip.size,purpose:"library",category:"recordings"}});
        const put=await fetch(signed.uploadUrl,{method:"PUT",headers:{"Content-Type":"audio/wav"},body:clip});
        if(!put.ok)throw new Error("The clip upload was rejected.");
        const completed=await api("/api/uploads/complete",{method:"POST",body:{fileId:signed.fileId,purpose:"library"}});
        return completed.file?.id?{bar:Number(item.bar),fileId:completed.file.id}:null;
      }catch(error){
        setCaptureMessage("The full recording was saved, but one mistake clip could not be uploaded: "+error.message);
        return null;
      }
    }));
    return results.filter(Boolean);
  }

  async function startSession(){
    if(session||busy)return;
    setBusy(true);setScoreLoadError("");standardCursorRef.current=0;setCurrentBar(null);
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
      const mistakeClips=engineSummary?.trouble?.length?await saveMistakeClips(blob,engineSummary.trouble):[];
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
        mistakeClips,
      }:null;
      const saved=await api("/api/practice/finish",{method:"PATCH",body:{sessionId:session.id,durationSeconds,score,feedback:feedbackPayload,recordingFileId}});
      const result={
        session:saved.session,summary:engineSummary,durationSeconds:Number(saved.session?.duration_seconds ?? durationSeconds),recordingFileId,
        task:config.task,sectionKey:config.sectionKey,mode:config.mode,referenceFile:config.referenceFile||null,
        recordingSaved:Boolean(recordingFileId),mistakeClips,
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
      {!navigator.mediaDevices?.getUserMedia&&<div className="pc-device-warning"><span>⚠</span><div>This browser does not support microphone input. You can still use an attached MIDI keyboard or your computer keys to practise.</div></div>}
      {navigator.mediaDevices?.getUserMedia&&/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)&&<div className="pc-device-warning"><span>📱</span><div>Mobile microphone detection works best in a quiet room with your device close to the piano. For chord accuracy, a USB or Bluetooth MIDI keyboard is recommended.</div></div>}
      {!window.requestMIDIAccess&&config.mode==="assisted"&&<div className="pc-device-warning"><span>♪</span><div>MIDI is not available in this browser. You can use the microphone for single notes or your computer keyboard.</div></div>}
      {scoreLoadError&&<p className="pc-form-error">{scoreLoadError}</p>}
      <button className="pc-button dark" onClick={startSession} disabled={busy||(config.mode==="assisted"&&!xmlReady)}>{busy?"Starting…":"Start session ↗"}</button>
      {config.mode==="assisted"&&!xmlReady&&<small>{scoreLoadError||"Preparing the MusicXML score…"}</small>}
    </section> : <div className="pc-session-stage">
      <div className="pc-session-status"><span className="pc-recording-dot"/><span>Session in progress · {captureMessage}{currentBar?" · Bar "+currentBar:""}</span><span className="pc-input-level"><i style={{width:captureLevel+"%"}}/></span></div>
      {config.mode==="assisted"&&xmlReady ? <Suspense fallback={<div className="pc-inline-status">Preparing your falling-note lesson…</div>}>
        <KeystoneLearnEngine xml={xml} bpm={120} title={config.task?.title||file?.original_name||"Your piece"} recordingStartedAt={captureRef.current?.startedAt||null} micInputRef={micInputRef} microphoneListening={Boolean(captureRef.current)} microphoneLevel={captureLevel} microphoneStatus={captureMessage} onProgress={setCurrentBar} onReady={handle=>{engineControlRef.current=handle;}} onFinish={finishSession} onClose={()=>{if(engineControlRef.current?.finish)engineControlRef.current.finish();else finishSession(null);}}/>
      </Suspense> : config.mode==="standard"&&file&&isPdf(file) ? <PracticePdf file={file} /> :
      config.mode==="standard"&&xmlReady ? <Suspense fallback={<div className="pc-inline-status">Rendering the score…</div>}><MusicXMLViewer xml={xml} title={file.original_name} currentMeasure={currentBar}/></Suspense> :
      <div className="pc-practice-no-score"><span>𝄞</span><h2>Practise at your own pace.</h2><p>{scoreLoadError||"Use your own sheet music or upload a score to see it alongside your session."}</p></div>}
      {config.mode==="standard"&&<div className="pc-standard-note"><strong>Standard Practice</strong><span>{standardEvents.length?"The microphone follows matching pitches through the score where possible. A MIDI keyboard or full score-alignment service is more reliable for chords.":"The session is recording, but this file has no structured note timeline for a live bar cursor."}</span></div>}
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
  const [mistakeAudioUrls,setMistakeAudioUrls]=useState({});
  const [scoreXml,setScoreXml]=useState("");
  const [scoreError,setScoreError]=useState("");
  const [activeMistake,setActiveMistake]=useState(0);
  const summary=feedback.summary;
  const mistakes=summary?.trouble||[];
  const referenceFile=feedback.referenceFile||null;
  const mistakeClips=feedback.mistakeClips||[];

  useEffect(()=>{
    let active=true;
    if(!feedback.recordingFileId)return ()=>{active=false;};
    api("/api/uploads/download?id="+encodeURIComponent(feedback.recordingFileId)+"&inline=1")
      .then(result=>{if(active)setAudioUrl(result.url);}).catch(()=>{});
    return()=>{active=false;};
  },[feedback.recordingFileId]);

  useEffect(()=>{
    let active=true;
    if(!mistakeClips.length)return ()=>{active=false;};
    Promise.all(mistakeClips.map(async clip=>{
      if(!clip.fileId)return null;
      try{
        const result=await api("/api/uploads/download?id="+encodeURIComponent(clip.fileId)+"&inline=1");
        return [clip.fileId,result.url];
      }catch{return null;}
    })).then(results=>{
      if(active)setMistakeAudioUrls(Object.fromEntries(results.filter(Boolean)));
    });
    return()=>{active=false;};
  },[mistakeClips.map(clip=>clip.fileId).join("|")]);

  useEffect(()=>{
    let active=true;
    setScoreXml("");setScoreError("");
    if(!referenceFile||!isMusicXml(referenceFile))return ()=>{active=false;};
    async function loadScore(){
      try{
        const link=await api("/api/uploads/download?id="+encodeURIComponent(referenceFile.id)+"&inline=1");
        const response=await fetch(link.url);
        if(!response.ok)throw new Error("The score could not be loaded from your collection.");
        const xml=await response.text();
        if(active)setScoreXml(xml);
      }catch(error){if(active)setScoreError(error.message||"The score could not be loaded.");}
    }
    loadScore();
    return()=>{active=false;};
  },[referenceFile?.id]);

  function move(delta){setActiveMistake(index=>Math.max(0,Math.min(mistakes.length-1,index+delta)));}
  const activeBar=Number(mistakes[activeMistake]?.bar);

  return <div className="pc-feedback-page">
    <div className="pc-feedback-heading"><button className="pc-back-link" onClick={onBack}>← Back to practice</button><span className="pc-eyebrow">SESSION COMPLETE</span><h1>A little more progress<em>.</em></h1><p>{feedback.task?.title||"Your practice session"} · {formatDuration(feedback.durationSeconds)} recorded</p></div>
    <section className="pc-feedback-written"><div><span className="pc-eyebrow">YOUR SESSION</span><h2>{summary?"Your assisted practice result":"Your practice has been saved."}</h2><p>{summary?"You matched "+summary.hits+" of "+summary.total+" expected notes in the selected passage. "+(summary.wrong?summary.wrong+" incorrect note attempts were detected. ":"")+"Revisit the marked bars below and try them again at a comfortable pace.":"Your session time has been saved to your practice history. This document did not provide note-level analysis, so no accuracy score or mistake claims have been generated."}</p></div>{summary&&<div className="pc-feedback-score"><strong>{summary.score}%</strong><small>SESSION SCORE</small></div>}</section>

    <section className="pc-feedback-recordings">
      <div className="pc-section-heading"><div><span className="pc-eyebrow">MISTAKE RECORDINGS</span><h2>Listen to the places to revisit</h2></div></div>
      {mistakes.length>0 ? <div className="pc-mistake-recordings">
        {mistakes.map((item,index)=>{
          const clip=mistakeClips.find(entry=>Number(entry.bar)===Number(item.bar));
          const clipUrl=clip?.fileId?mistakeAudioUrls[clip.fileId]:"";
          return <article className={"pc-mistake-recording "+(activeMistake===index?"active":"")} key={item.bar+"-"+index}>
            <button type="button" className="pc-mistake-recording-target" onClick={()=>setActiveMistake(index)}>
              <span className="pc-mistake-number">{String(index+1).padStart(2,"0")}</span>
              <span><strong>Bar {item.bar}</strong><small>{(item.notes||[]).join(" · ")||"Revisit this passage"}</small></span>
              <b>View on sheet ↗</b>
            </button>
            {clipUrl?<audio controls preload="metadata" src={clipUrl} onPlay={()=>setActiveMistake(index)} aria-label={"Mistake recording for bar "+item.bar}/>:<small className="pc-muted-small">{clip?"Preparing the clip…":"No separate clip was saved for this bar."}</small>}
          </article>;
        })}
      </div> : <p>{summary?"No specific trouble bars were returned by the practice engine.":"Mistake-level recordings require note-level score analysis; your session duration has still been saved."}</p>}
      {audioUrl&&<details className="pc-full-session-audio"><summary>Listen to the full session recording</summary><audio controls preload="metadata" src={audioUrl}/></details>}
      {!audioUrl&&<p className="pc-muted-small">{feedback.recordingSaved?"The full session recording is saved in your Sheet Music collection.":"No audio recording was saved for this session."}</p>}
    </section>

    <section className="pc-feedback-sheet">
      <div className="pc-section-heading"><div><span className="pc-eyebrow">SHEET MUSIC</span><h2>Your score, with mistakes highlighted</h2><p>Every detected mistake is marked in orange. Select a recording or use the arrows to move to its bar.</p></div>
        {mistakes.length>0&&<div className="pc-mistake-nav"><button onClick={()=>move(-1)} disabled={activeMistake===0} aria-label="Previous mistake">←</button><span>{activeMistake+1} / {mistakes.length}</span><button onClick={()=>move(1)} disabled={activeMistake===mistakes.length-1} aria-label="Next mistake">→</button></div>}
      </div>
      {scoreXml?<MusicXMLViewer xml={scoreXml} title={referenceFile?.original_name||feedback.task?.title||"Your score"} highlightMeasures={mistakes.map(item=>Number(item.bar))} focusMeasure={Number.isInteger(activeBar)&&activeBar>0?activeBar:null}/>:
        referenceFile&&!isMusicXml(referenceFile)?<div className="pc-linked-score"><span className="pc-file-icon">▤</span><div><strong>{referenceFile.original_name}</strong><small>{scoreError||"Open the original score. Page-level mistake highlights require score-recognition alignment."}</small></div><button className="pc-button outline" onClick={()=>onOpenFile(referenceFile)}>Open sheet ↗</button></div>:
        <div className="pc-empty-chart"><span>𝄞</span><p>{scoreError||"A MusicXML score linked to this session will appear here with orange mistake markers."}</p></div>}
      {mistakes.length>0&&activeBar>0&&<div className="pc-active-mistake"><strong>Currently viewing bar {activeBar}</strong><p>{(mistakes[activeMistake]?.notes||[]).join(", ")}</p><small>You can still scroll manually to any other part of the score.</small></div>}
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
  const [checkoutInterval,setCheckoutInterval]=useState("monthly");
  const [discountCode,setDiscountCode]=useState("");
  const [checkoutSecret,setCheckoutSecret]=useState("");
  const [deletionStep,setDeletionStep]=useState("idle");
  const [deletionConfirmPassword,setDeletionConfirmPassword]=useState("");
  const [deletionCode,setDeletionCode]=useState("");\n  const [discountBusy,setDiscountBusy]=useState(false);\n  const [discountMessage,setDiscountMessage]=useState("");
  const [deletionBusy,setDeletionBusy]=useState(false);
  const [deletionMessage,setDeletionMessage]=useState("");
  const plan=user.plan||"free";
  const connected=(auth.currentUser?.providerData||[]).map(provider=>provider.providerId);
  const deletionScheduled=user.deletion_scheduled_at;
  const deletionRequested=user.deletion_requested_at;
  const deletionDate=deletionScheduled?new Date(deletionScheduled):null;
  const deletionDaysLeft=deletionDate?Math.max(0,Math.ceil((deletionDate-new Date())/(1000*60*60*24))):0;
  const deletionActive=Boolean(deletionScheduled)&&deletionDaysLeft>0;
  const deletionExpired=Boolean(deletionScheduled)&&deletionDaysLeft<=0;
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
      await api("/api/profile",{method:"PATCH",body:{examBoard:user.exam_board,grade:user.grade,plan:selected,interval:checkoutInterval,targetDate,bookSources:Array.isArray(user.book_sources)?user.book_sources:[],examBookSkipped:!user.exam_book_file_id}});
      const checkout=await api("/api/billing/checkout",{method:"POST",body:{plan:selected,interval:checkoutInterval,discountCode:discountCode.trim()||undefined}});
      setCheckoutSecret(checkout.clientSecret);
    }catch(error){setAccountMessage(error.message||"Checkout could not be opened.");}
  }
  async function requestDeletion(event){
    event.preventDefault();
    setDeletionBusy(true);
    setDeletionMessage("");
    try{
      const current=auth.currentUser;
      const passwordProvider=(current.providerData||[]).some(p=>p.providerId==="password");
      if(passwordProvider){
        if(!deletionConfirmPassword)throw new Error("Enter your password to confirm your identity.");
        const credential=EmailAuthProvider.credential(current.email,deletionConfirmPassword);
        await reauthenticateWithCredential(current,credential);
      }else{
        const connectedProvider=(current.providerData||[]).find(p=>p.providerId!=="password");
        if(!connectedProvider)throw new Error("Reconnect your sign-in service before deleting your account.");
        const provider=connectedProvider.providerId==="google.com"?googleProvider:new OAuthProvider(connectedProvider.providerId);
        await reauthenticateWithPopup(current,provider);
      }
      const result=await api("/api/profile",{method:"PATCH",body:{deletionAction:{action:"send-code"}}});
      setDeletionStep("code");
      setDeletionCode("");
      setDeletionConfirmPassword("");
      setDeletionMessage(result.message||"A six-digit confirmation code has been emailed to you.");
    }catch(error){
      setDeletionMessage(error.message||"We could not verify your identity. Please try again.");
    }finally{setDeletionBusy(false);}
  }
  async function confirmDeletion(event){
    event.preventDefault();
    setDeletionBusy(true);
    setDeletionMessage("");
    try{
      await api("/api/profile",{method:"PATCH",body:{deletionAction:{action:"verify-code",code:deletionCode}}});
      await onRefresh();
      setDeletionStep("requested");
      setDeletionCode("");
      setDeletionMessage("Your code is confirmed. Your account is scheduled for deletion in 15 days. You can cancel during that period.");
    }catch(error){
      setDeletionMessage(error.message||"That confirmation code could not be verified.");
    }finally{setDeletionBusy(false);}
  }
  async function applyCurrentDiscount(){
    setDiscountBusy(true);
    setDiscountMessage("");
    try{
      const result=await api("/api/billing/apply-discount",{method:"POST",body:{discountCode:discountCode.replace(/\s/g,"")}});
      setDiscountMessage(result.message||"Your discount has been applied.");
      setDiscountCode("");
    }catch(error){setDiscountMessage(error.message||"The discount could not be applied.");}
    finally{setDiscountBusy(false);}
  }
  async function cancelDeletion(){
    setDeletionBusy(true);
    setDeletionMessage("");
    try{
      await api("/api/profile",{method:"PATCH",body:{deletionAction:{action:"cancel"}}});
      await onRefresh();
      setDeletionStep("idle");
      setDeletionConfirmPassword("");
      setDeletionMessage("Your deletion request has been cancelled. Welcome back.");
    }catch(error){
      setDeletionMessage(error.message||"We could not cancel the deletion request.");
    }finally{setDeletionBusy(false);}
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
      <div className="pc-profile-logout"><button type="button" className="pc-button outline" onClick={async()=>{try{await signOut(auth);window.location.assign("/");}catch(error){setAccountMessage(error.message||"You could not be signed out.");}}}>Log out</button></div>
      <section className="pc-panel pc-profile-section pc-delete-note">
        <span className="pc-eyebrow">05 · ACCOUNT DELETION</span>
        <h2>Leaving Piano Coach?</h2>
        {deletionActive ? (
          <>
            <p className="pc-deletion-warning">Your account is scheduled for permanent deletion on <strong>{deletionDate.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</strong> — that's <strong>{deletionDaysLeft} day{deletionDaysLeft===1?"":"s"}</strong> from now.</p>
            <p>During this 15-day grace period your account remains accessible. Your subscription has been automatically cancelled. After the grace period, all of your data will be permanently deleted.</p>
            {deletionMessage&&<p className="pc-form-error" role="alert">{deletionMessage}</p>}
            <button type="button" className="pc-button outline" disabled={deletionBusy} onClick={cancelDeletion}>{deletionBusy?"Cancelling…":"Cancel deletion request"}</button>
          </>
        ) : deletionExpired ? (
          <>
            <p className="pc-deletion-warning">The 15-day grace period has ended. Your account is being processed for permanent deletion and can no longer be cancelled from here.</p>
            <p>If you believe this is an error, please contact support immediately.</p>
          </>
        ) : deletionStep==="idle" ? (
          <>
            <p>Requesting account deletion will verify your identity, cancel any active subscription, and start a <strong>15-day grace period</strong>. During that time you can cancel the request and keep your account. After 15 days, all of your data is permanently deleted.</p>
            <button type="button" className="pc-button danger" onClick={()=>{setDeletionStep("confirm");setDeletionMessage("");}}>Request account deletion</button>
          </>
        ) : deletionStep==="code" ? (
          <>
            <p className="pc-deletion-warning">Enter the six-digit code we emailed to your account. The code expires after 10 minutes.</p>
            <form onSubmit={confirmDeletion} className="pc-deletion-form">
              <label className="field"><span>Email confirmation code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={deletionCode} onChange={e=>setDeletionCode(e.target.value.replace(/[^0-9]/g,"").slice(0,6))} required/></label>
              {deletionMessage&&<p className="pc-form-error" role="alert">{deletionMessage}</p>}
              <div className="pc-deletion-buttons">
                <button type="submit" className="pc-button danger" disabled={deletionBusy||deletionCode.length!==6}>{deletionBusy?"Checking…":"Verify code and continue"}</button>
                <button type="button" className="pc-button outline" disabled={deletionBusy} onClick={()=>{setDeletionStep("confirm");setDeletionCode("");setDeletionMessage("");}}>Back</button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="pc-deletion-warning">To confirm your identity, please {connected.includes("password")?"enter your password":"sign in again with your connected service"} below. We will then email you a six-digit confirmation code.</p>
            <form onSubmit={requestDeletion} className="pc-deletion-form">
              {connected.includes("password")&&<label className="field"><span>Your password</span><input type="password" autoComplete="current-password" value={deletionConfirmPassword} onChange={e=>setDeletionConfirmPassword(e.target.value)} required/></label>}
              {deletionMessage&&<p className="pc-form-error" role="alert">{deletionMessage}</p>}
              <div className="pc-deletion-buttons">
                <button type="submit" className="pc-button danger" disabled={deletionBusy}>{deletionBusy?"Verifying…":"Continue"}</button>
                <button type="button" className="pc-button outline" disabled={deletionBusy} onClick={()=>{setDeletionStep("idle");setDeletionConfirmPassword("");setDeletionMessage("");}}>Back</button>
              </div>
            </form>
          </>
        )}
      </section>
      <section className="pc-panel pc-profile-section"><span className="pc-eyebrow">06 · SUBSCRIPTION</span><div className="pc-billing-heading"><div><h2>{plan==="pro"?"Piano Coach Pro":plan==="basic"?"Piano Coach Basic":"Free demo"}</h2><p>{plan==="pro"?(user.subscription_interval==="annual"?"Pro · billed annually":"£19.99 per month"):plan==="basic"?(user.subscription_interval==="annual"?"Basic · billed annually":"£9.99 per month"):"60 lifetime practice minutes"}</p></div><span className="pc-plan-tag">{String(user.subscription_status||"free").replace("_"," ").toUpperCase()}</span></div>
        {user.stripe_customer_id?<><button type="button" className="pc-button outline" onClick={openPortal}>Manage subscription ↗</button>{user.stripe_subscription_id&&["active","trialing","past_due"].includes(user.subscription_status)&&<div className="pc-upgrade-row pc-existing-discount"><label>Apply a discount code<input value={discountCode} onChange={e=>setDiscountCode(formatPromoCodeInput(e.target.value))} placeholder="XXXX XXXX" autoComplete="off" maxLength={25}/></label><button type="button" className="pc-button dark" onClick={applyCurrentDiscount} disabled={discountBusy||!discountCode.trim()}>{discountBusy?"Applying…":"Apply code"}</button>{discountMessage&&<p className="pc-muted-small" role="status">{discountMessage}</p>}</div>}</>:<div className="pc-upgrade-row"><label>Choose plan<select value={checkoutPlan} onChange={e=>setCheckoutPlan(e.target.value)}><option value="basic">Basic</option><option value="pro">Pro</option></select></label><label>Billing interval<select value={checkoutInterval} onChange={e=>setCheckoutInterval(e.target.value)}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label><label>Discount code (optional)<input value={discountCode} onChange={e=>setDiscountCode(formatPromoCodeInput(e.target.value))} placeholder="XXXX XXXX" autoComplete="off" maxLength={25}/></label><button type="button" className="pc-button dark" onClick={startCheckout}>Continue to Stripe ↗</button></div>}
        <p className="pc-muted-small">Plan and billing interval changes are managed securely through Stripe. Piano Coach updates your account when Stripe confirms the change.</p>
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
