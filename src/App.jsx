import { useEffect, useMemo, useState } from "react";
import { auth } from "./lib/firebase.js";

const nav = [
  { id: "home", label: "Dashboard", icon: "⌂" },
  { id: "practice", label: "Practice", icon: "♫" },
  { id: "sheets", label: "Sheet Music", icon: "▤" },
  { id: "grade", label: "Grade Plan", icon: "▥" },
  { id: "extras", label: "Extras", icon: "✳", pro: true },
];
const pieces = [
  { title: "Clair de Lune", composer: "Claude Debussy", detail: "Performance piece · Grade 5", progress: 72, time: "12 min ago", tag: "Needs attention" },
  { title: "Sonatina in C, Op. 36 No. 1", composer: "Muzio Clementi", detail: "Performance piece · Grade 5", progress: 46, time: "Yesterday", tag: "In progress" },
  { title: "The Swing", composer: "Traditional", detail: "Study · Grade 5", progress: 88, time: "2 days ago", tag: "Nearly ready" },
];
const tasks = [
  { title: "Clair de Lune", sub: "Performance piece", duration: "15 min", type: "piece" },
  { title: "A minor harmonic", sub: "Scale · hands together", duration: "5 min", type: "scale" },
  { title: "Sight-reading exercise 4", sub: "Sight-reading", duration: "5 min", type: "exercise" },
];
function Icon({ children, className = "" }) { return <span aria-hidden="true" className={`icon ${className}`}>{children}</span>; }
function Button({ children, kind = "primary", onClick, className = "", ...props }) {
  return <button className={`button ${kind} ${className}`} onClick={onClick} {...props}>{children}</button>;
}
function Progress({ value, small = false }) {
  return <div className={`progress ${small ? "small" : ""}`}><span style={{ width: `${value}%` }} /></div>;
}
function App() {
  const [page, setPage] = useState("home");
  const [collapsed, setCollapsed] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notice, setNotice] = useState("");
  const [streak, setStreak] = useState(12);
  const [practiceRunning, setPracticeRunning] = useState(false);
  const [practiceSessionId, setPracticeSessionId] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [theme, setTheme] = useState("light");
  const [notation, setNotation] = useState("standard");
  const [reminders, setReminders] = useState(true);
  const [selectedTask, setSelectedTask] = useState(tasks[0]);
  const [search, setSearch] = useState("");
  const [fileName, setFileName] = useState("");
  const [profileTab, setProfileTab] = useState("details");
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!practiceRunning) return;
    const id = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [practiceRunning]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const time = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);
  const go = id => { setPage(id); setShowProfile(false); setShowAdmin(false); };
  const startPractice = async () => {
    if (!practiceSessionId) {
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch("/api/practice/start", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ mode: "standard" }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not start practice.");
        setPracticeSessionId(body.session.id);
        setSeconds(0);
      } catch (error) { toast(error.message || "Could not start practice."); return; }
    }
    setPracticeRunning(true);
  };
  const finishPractice = async () => {
    setPracticeRunning(false);
    if (practiceSessionId) {
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch("/api/practice/finish", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ sessionId: practiceSessionId, durationSeconds: seconds }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not save practice.");
        setPracticeSessionId(null);
        toast("Practice saved · " + Math.floor(body.session.duration_seconds / 60) + " minutes recorded.");
      } catch (error) { toast(error.message || "Could not save practice."); }
    } else toast("Start a session first to record your practice.");
  };
  const toast = message => { setNotice(message); window.setTimeout(() => setNotice(""), 2800); };

  return <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><span>𝄞</span></div>
        {!collapsed && <div className="brand-name">Piano <em>Coach</em><small>YOUR MUSICAL JOURNEY</small></div>}
      </div>
      <button className="collapse-button" onClick={() => setCollapsed(v => !v)} aria-label="Toggle sidebar"><Icon>☰</Icon></button>
      <div className="nav-caption">{!collapsed && "WORKSPACE"}</div>
      <nav className="main-nav">
        {nav.map(item => <button key={item.id} className={`nav-item ${page === item.id && !showProfile ? "active" : ""}`} onClick={() => item.pro ? toast("Extras is available with Piano Coach Pro.") : go(item.id)} title={collapsed ? item.label : undefined}>
          <Icon>{item.icon}</Icon>{!collapsed && <><span>{item.label}</span>{item.pro && <span className="pro-pill">PRO</span>}</>}
        </button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-card">
        {!collapsed && <><div className="sidebar-card-icon">✧</div><strong>A little progress<br/>every day.</strong><p>Your next great performance starts with today's practice.</p><Button kind="light" onClick={() => go("practice")}>Start practising <span>↗</span></Button></>}
        {collapsed && <button className="mini-cta" onClick={() => go("practice")}>✧</button>}
      </div>
      <div className="sidebar-bottom">
        <button className={`nav-item ${showProfile ? "active" : ""}`} onClick={() => {setShowProfile(true);setShowAdmin(false);}}><Icon>◉</Icon>{!collapsed && <span>Profile & settings</span>}</button>
        <button className="nav-item" onClick={() => toast("Help centre is coming soon.")}><Icon>?</Icon>{!collapsed && <span>Help & support</span>}</button>
        <div className="user-chip"><div className="avatar">AT</div>{!collapsed && <div className="user-meta"><strong>Alex Taylor</strong><small>Grade 5 · ABRSM</small></div>}{!collapsed && <span className="more">•••</span>}</div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{showProfile ? "Profile" : showAdmin ? "Admin" : nav.find(n => n.id === page)?.label}</strong></div>
        <div className="top-actions"><button className="icon-button" onClick={() => toast("You're all caught up.")} aria-label="Notifications">♧<i /></button><div className="top-divider" /><button className="top-user" onClick={() => setShowProfile(true)}><div className="avatar small-avatar">AT</div><span>Alex Taylor</span><span className="chevron">⌄</span></button></div>
      </header>
      <div className="page-content">
        {showProfile ? <Profile theme={theme} setTheme={setTheme} notation={notation} setNotation={setNotation} reminders={reminders} setReminders={setReminders} toast={toast} profileTab={profileTab} setProfileTab={setProfileTab}/> :
        showAdmin ? <Admin toast={toast}/> :
        page === "home" ? <Dashboard go={go} streak={streak} setStreak={setStreak} toast={toast}/> :
        page === "practice" ? <Practice running={practiceRunning} setRunning={setPracticeRunning} onStart={startPractice} onFinish={finishPractice} time={time} seconds={seconds} selected={selectedTask} setSelected={setSelectedTask} toast={toast}/> :
        page === "sheets" ? <SheetMusic search={search} setSearch={setSearch} fileName={fileName} setFileName={setFileName} toast={toast}/> :
        page === "grade" ? <GradePlan toast={toast}/> :
        page === "extras" ? <Extras toast={toast}/> : null}
      </div>
    </main>
    {notice && <div className="toast"><span>✓</span>{notice}</div>}
  </div>;
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
function Dashboard({ go, streak, setStreak, toast }) {
  const [done, setDone] = useState([true, false, false]);
  const complete = done.filter(Boolean).length;
  return <>
    <PageHeading eyebrow="MONDAY, 9 NOVEMBER" title={<>Good afternoon, Alex<span className="heading-period">.</span></>} subtitle="A little time at the piano today goes a long way." action={<Button kind="outline" onClick={() => toast("Your weekly practice report is being prepared.")}>↗ <span>Weekly report</span></Button>}/>
    <section className="welcome-grid">
      <div className="hero-card">
        <div className="hero-copy"><div className="hero-kicker"><span className="spark">✦</span> YOUR DAILY PRACTICE</div><h2>Make today<br/><em>sound beautiful.</em></h2><p>You're building something lovely, one practice at a time.</p><Button kind="cream" onClick={() => go("practice")}>Begin practice <span>→</span></Button></div>
        <div className="hero-art" aria-hidden="true"><div className="halo halo-one"/><div className="halo halo-two"/><div className="piano-art"><div className="piano-lid"/><div className="piano-keys">{Array.from({length:14},(_,i)=><span key={i} className={ [1,3,6,8,10,13].includes(i) ? "black-key" : ""}/>)}</div><div className="piano-leg left"/><div className="piano-leg right"/></div><div className="music-note note-one">♪</div><div className="music-note note-two">♫</div><div className="music-note note-three">♬</div></div>
      </div>
      <div className="streak-card">
        <div className="card-topline"><span>YOUR STREAK</span><span className="flame">♨</span></div><div className="streak-number">{streak}<small> days</small></div><p>You're showing up for your music. Keep it going!</p><div className="week-dots">{["M","T","W","T","F","S","S"].map((d,i)=><div key={i} className={`week-day ${i < 5 ? "complete" : ""}`}><span>{d}</span><b>{i < 5 ? "✓" : "·"}</b></div>)}</div><div className="streak-foot"><span>15 min daily goal</span><strong>5 / 7 days</strong></div><Progress value={71} small/>
      </div>
    </section>
    <section className="stats-grid">
      <Stat label="THIS WEEK" value="2h 35m" note="+18% from last week" icon="◷" />
      <Stat label="PRACTICE SESSIONS" value="8" note="Across 4 different days" icon="♫"/>
      <Stat label="GRADE PROGRESS" value="64%" note="ABRSM Grade 5" icon="⌁"/>
      <Stat label="NEXT MILESTONE" value="30 days" note="18 days to go" icon="✧"/>
    </section>
    <div className="content-grid">
      <section className="panel recommended-panel">
        <div className="section-heading"><div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>Recommended for you</h2></div><button className="text-link" onClick={() => go("grade")}>View grade plan ↗</button></div>
        <div className="recommended-piece"><div className="piece-art"><span>♬</span><small>CLAUDE DEBUSSY</small></div><div className="piece-info"><div className="piece-tag">PERFORMANCE PIECE</div><h3>Clair de Lune</h3><p>Suite bergamasque · Grade 5</p><div className="piece-progress"><Progress value={72}/><span>72%</span></div><div className="piece-actions"><Button onClick={() => go("practice")}>Practise this piece <span>→</span></Button><button className="subtle-button" onClick={() => toast("Choose another piece from your Grade Plan.")}>Choose another</button></div></div></div>
      </section>
      <section className="panel today-panel">
        <div className="section-heading"><div><div className="eyebrow">YOUR PLAN</div><h2>Today's focus</h2></div><span className="date-chip">15–25 MIN</span></div>
        <div className="task-list">{tasks.map((task,i)=><button className={`task-row ${done[i] ? "task-done" : ""}`} key={task.title} onClick={() => setDone(old => old.map((v,j)=>j===i?!v:v))}><span className="task-check">{done[i] ? "✓" : ""}</span><span className="task-copy"><strong>{task.title}</strong><small>{task.sub}</small></span><span className="task-duration">{task.duration}</span></button>)}</div>
        <div className="today-foot"><span>{complete} of 3 completed</span><strong>{Math.round(complete/3*100)}%</strong></div><Progress value={complete/3*100} small/>
      </section>
    </div>
    <div className="bottom-tip"><span className="tip-icon">✦</span><div><strong>A note to remember</strong><p>Slow practice is still progress. Take your time with the tricky middle section of Clair de Lune.</p></div><button onClick={() => go("practice")}>Open practice →</button></div>
  </>;
}
function Stat({ label, value, note, icon }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{note}</small></div>; }

function Practice({ running, setRunning, onStart, onFinish, time, seconds, selected, setSelected, toast }) {
  const [hand, setHand] = useState("both");
  const [tempo, setTempo] = useState(72);
  const [finished, setFinished] = useState(false);
  return <>
    <PageHeading eyebrow="YOUR PRACTICE SPACE" title="Let's make some music." subtitle="Choose a focus, settle in, and enjoy the process." action={<span className="session-chip"><i/> SESSION READY</span>}/>
    <div className="practice-layout">
      <section className="panel practice-main">
        <div className="practice-piece-head"><div><div className="eyebrow">CURRENTLY PRACTISING</div><h2>{selected.title}</h2><p>{selected.sub} · Grade 5 ABRSM</p></div><button className="text-link" onClick={() => toast("Piece selector opened from your Grade Plan.")}>Change piece ↗</button></div>
        <div className="practice-sheet"><div className="sheet-top"><span>CLAIR DE LUNE</span><span>Claude Debussy</span></div><div className="staff"><div className="clef">𝄞</div><div className="staff-lines"><div className="bar"><i className="note n1"/><i className="note n2"/><i className="note n3"/><i className="note n4"/></div><div className="bar"><i className="note n5"/><i className="note n6"/><i className="note n7"/></div><div className="bar"><i className="note n8"/><i className="note n9"/><i className="note n10"/></div></div></div><div className="staff second"><div className="clef bass">𝄢</div><div className="staff-lines"><div className="bar"><i className="note n2"/><i className="note n4"/><i className="note n6"/></div><div className="bar"><i className="note n1"/><i className="note n3"/><i className="note n8"/></div><div className="bar"><i className="note n5"/><i className="note n7"/></div></div></div><div className="sheet-page">1</div></div>
        <div className="sheet-caption"><span>Illustrative score preview</span><button onClick={() => toast("Full score view will open when a score is connected.")}>Open full sheet ↗</button></div>
        <div className="practice-controls"><div className="hand-select"><span>HANDS</span>{["right","both","left"].map(v=><button key={v} className={hand===v?"selected":""} onClick={()=>setHand(v)}>{v==="both"?"Both":v==="right"?"Right":"Left"}</button>)}</div><div className="tempo-control"><span>TEMPO <b>{tempo} BPM</b></span><input type="range" min="40" max="180" value={tempo} onChange={e=>setTempo(+e.target.value)}/></div></div>
      </section>
      <aside className="practice-side">
        <div className="panel timer-panel"><div className="eyebrow">SESSION TIMER</div><div className="timer">{time}</div><div className="timer-sub">{running ? "You're in the zone." : "Ready when you are."}</div><Button onClick={()=>setRunning(v=>!v)}>{running?"Ⅱ Pause session":"▶ Start session"}</Button><button className="finish-button" onClick={()=>{setRunning(false);setFinished(true);toast("Session saved locally for this preview.")}}>Finish practice</button>{finished&&<div className="saved-note">✓ Session marked complete</div>}</div>
        <div className="panel focus-panel"><div className="section-heading"><h3>Session focus</h3><span className="soft-badge">TODAY</span></div><div className="focus-item"><span className="focus-number">01</span><div><strong>Shape the melody</strong><small>Bring out the top line gently.</small></div></div><div className="focus-item"><span className="focus-number">02</span><div><strong>Even left hand</strong><small>Keep the accompaniment flowing.</small></div></div><div className="focus-item"><span className="focus-number">03</span><div><strong>Slow, then steady</strong><small>Build confidence before tempo.</small></div></div></div>
        <div className="practice-quote">“Music is the movement of sound to reach the soul.”<small>— Plato</small></div>
      </aside>
    </div>
  </>;
}

function SheetMusic({ search, setSearch, fileName, setFileName, toast }) {
  const [tab, setTab] = useState("my-sheets");
  const [drag, setDrag] = useState(false);
  const onFile = f => { if(f) {setFileName(f.name);toast(`${f.name} selected. Converter processing will be connected next.`);} };
  return <>
    <PageHeading eyebrow="YOUR MUSIC LIBRARY" title="Sheet Music" subtitle="Bring your scores together, ready for your next practice." action={<Button onClick={()=>document.getElementById("sheet-upload").click()}>＋ Import sheet music</Button>}/>
    <div className="panel sheet-converter">
      <div className="converter-copy"><div className="eyebrow">SHEET MUSIC CONVERTER</div><h2>Your music, ready to play.</h2><p>Import a score to organise it in your collection and prepare it for practice.</p><div className="format-list"><span>PDF</span><span>PNG / JPG</span><span>MusicXML</span><span>MIDI</span></div></div>
      <label className={`upload-zone ${drag?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);onFile(e.dataTransfer.files[0]);}}><input id="sheet-upload" type="file" accept=".pdf,.png,.jpg,.jpeg,.xml,.musicxml,.mid,.midi" onChange={e=>onFile(e.target.files[0])}/><span className="upload-icon">↑</span><strong>{fileName || "Drop a score here, or browse files"}</strong><small>PDF, image, MusicXML or MIDI · One score at a time</small><span className="upload-browse">Choose a file</span></label>
    </div>
    <div className="tabs-row"><button className={tab==="my-sheets"?"active":""} onClick={()=>setTab("my-sheets")}>My sheet music <span>6</span></button><button className={tab==="recent"?"active":""} onClick={()=>setTab("recent")}>Recently opened</button><div className="search-box"><Icon>⌕</Icon><input placeholder="Search your music..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
    {tab==="my-sheets" ? <div className="library-grid">{[
      ["Clair de Lune","Claude Debussy","PDF","score","72%"],
      ["Sonatina in C","Muzio Clementi","MUSICXML","score","46%"],
      ["The Swing","Traditional","PDF","score","88%"],
      ["A minor scales","ABRSM","MUSICCOACH","score","Ready"],
      ["Moonlight Sonata","Ludwig van Beethoven","MIDI","music","New"],
      ["Practice recording 04","Your recording","AUDIO","audio","02:18"],
    ].filter(a=>a[0].toLowerCase().includes(search.toLowerCase())).map((a,i)=><div className="library-card" key={a[0]}><div className={`library-thumb ${a[3]}`}>{a[3]==="audio"?"◖":a[3]==="music"?"♫":"𝄞"}<span>{a[2]}</span></div><div className="library-info"><strong>{a[0]}</strong><small>{a[1]}</small><div><span>{a[4]}</span><button onClick={()=>toast(`Opening ${a[0]}…`)}>Open ↗</button></div></div></div>)}</div> : <div className="empty-state"><span>◷</span><h3>No recent scores yet</h3><p>Scores you open will appear here.</p></div>}
  </>;
}
function GradePlan({ toast }) {
  const [board,setBoard] = useState("ABRSM");
  const [grade,setGrade] = useState("Grade 5");
  const [expanded,setExpanded] = useState("pieces");
  const groups = [
    {id:"pieces",name:"Performance pieces",count:"3 pieces",items:[["Clair de Lune","Claude Debussy","72%"],["Sonatina in C, Op. 36 No. 1","Muzio Clementi","46%"],["The Swing","Traditional","88%"]]},
    {id:"scales",name:"Scales & arpeggios",count:"18 requirements",items:[["A minor harmonic","Hands together · 2 octaves","In progress"],["E-flat major","Hands together · 2 octaves","To learn"],["D minor contrary motion","Hands together","To learn"]]},
    {id:"exercises",name:"Technical exercises",count:"4 exercises",items:[["Finger independence","Exercise 2","In progress"],["Wrist rotation","Exercise 4","To learn"]]},
    {id:"sight",name:"Sight-reading",count:"12 exercises",items:[["Sight-reading exercise 4","Level 5","To learn"],["Sight-reading exercise 5","Level 5","To learn"]]},
  ];
  return <>
    <PageHeading eyebrow="YOUR EXAM JOURNEY" title="Grade Plan" subtitle="Everything you need for your next piano milestone." action={<Button kind="outline" onClick={()=>toast("Grade plan settings opened.")}>⚙ Plan settings</Button>}/>
    <div className="grade-overview"><div><div className="eyebrow">CURRENT GOAL</div><h2>{grade} <span>{board}</span></h2><p>Target completion · 30 June 2027</p><div className="grade-progress"><Progress value={64}/><strong>64%</strong></div></div><div className="grade-ring"><div><strong>64%</strong><small>COMPLETE</small></div></div></div>
    <div className="grade-toolbar"><div><span>EXAM BOARD</span><select value={board} onChange={e=>setBoard(e.target.value)}><option>ABRSM</option><option>Trinity</option></select></div><div><span>GRADE</span><select value={grade} onChange={e=>setGrade(e.target.value)}>{["Initial","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8"].map(x=><option key={x}>{x}</option>)}</select></div><button className="text-link" onClick={()=>toast("Your target date can be changed in Profile.")}>Edit target date ↗</button></div>
    <div className="grade-sections">{groups.map(g=><section className="panel grade-group" key={g.id}><button className="grade-group-head" onClick={()=>setExpanded(expanded===g.id?"":g.id)}><span className="group-symbol">{g.id==="pieces"?"♫":g.id==="scales"?"♬":g.id==="exercises"?"⌁":"▤"}</span><span><strong>{g.name}</strong><small>{g.count}</small></span><span className="group-chevron">{expanded===g.id?"−":"+"}</span></button>{expanded===g.id&&<div className="grade-items">{g.items.map((item,i)=><div className="grade-item" key={item[0]}><span className="grade-item-index">{String(i+1).padStart(2,"0")}</span><div><strong>{item[0]}</strong><small>{item[1]}</small></div><span className="grade-item-progress">{item[2]}</span><button onClick={()=>toast(`Opening ${item[0]} in Practice.`)}>Practise →</button></div>)}</div>}</section>)}</div>
  </>;
}
function Extras({ toast }) {
  return <><PageHeading eyebrow="YOUR CREATIVE SPACE" title="Extras" subtitle="Explore music beyond your exam programme." action={<span className="pro-label">✦ PIANO COACH PRO</span>}/><div className="extras-hero"><div><div className="eyebrow">BEYOND THE SYLLABUS</div><h2>Your music.<br/><em>Your way.</em></h2><p>Upload the pieces you love, explore something new, and make the piano yours.</p><Button kind="cream" onClick={()=>toast("Choose a score to add to Extras.")}>＋ Add your own music</Button></div><div className="extras-illustration">♫<span>♪</span><i>♬</i></div></div><div className="extras-cards"><div className="panel"><span className="feature-icon">♬</span><h3>My own pieces</h3><p>Keep personal repertoire separate from your exam grade plan.</p><button className="text-link" onClick={()=>toast("Your personal repertoire will appear here.")}>Explore pieces →</button></div><div className="panel"><span className="feature-icon">✧</span><h3>Music Assistant</h3><p>Ask questions about your music, technique and practice routine.</p><button className="text-link" onClick={()=>toast("Music Assistant is being prepared.")}>Open assistant →</button></div></div></>;
}
function Profile({ theme,setTheme,notation,setNotation,reminders,setReminders,toast,profileTab,setProfileTab }) {
  return <><PageHeading eyebrow="YOUR ACCOUNT" title="Profile" subtitle="A few details to make Piano Coach feel like yours."/><div className="profile-tabs"><button className={profileTab==="details"?"active":""} onClick={()=>setProfileTab("details")}>Personal details</button><button className={profileTab==="preferences"?"active":""} onClick={()=>setProfileTab("preferences")}>Preferences</button><button className={profileTab==="account"?"active":""} onClick={()=>setProfileTab("account")}>Account & billing</button></div>
    {profileTab==="details"&&<div className="panel profile-panel"><div className="profile-section"><div className="profile-avatar">AT</div><div><h2>Alex Taylor</h2><p>Grade 5 · ABRSM Board</p></div><Button kind="outline" onClick={()=>toast("Profile editing will be connected to your account.")}>Edit profile</Button></div><div className="form-grid"><Field label="Name" value="Alex Taylor"/><Field label="Preferred name" value="Alex"/><Field label="Email address" value="alex.taylor@example.com"/><Field label="Grade and exam board" value="Grade 5 ABRSM Board"/><Field label="Target completion date" value="30 June 2027"/></div><div className="profile-section compact"><div><h3>Connected services</h3><p>Google · Not connected &nbsp; Microsoft · Not connected</p></div><button className="text-link" onClick={()=>toast("Connected account settings opened.")}>Manage ↗</button></div></div>}
    {profileTab==="preferences"&&<div className="panel profile-panel"><h2>Practice preferences</h2><div className="setting-row"><div><strong>Reminders</strong><p>Receive practice reminders by email and browser notification.</p></div><button className={`toggle ${reminders?"on":""}`} onClick={()=>setReminders(v=>!v)}><i/></button></div><div className="setting-row"><div><strong>Notation style</strong><p>Choose how your sheet music is displayed.</p></div><select value={notation} onChange={e=>setNotation(e.target.value)}><option value="standard">Standard</option><option value="closer">Closer together</option><option value="larger">Larger noteheads</option><option value="inverted">Inverted</option></select></div><div className="notation-preview"><div className="eyebrow">PREVIEW</div><div className={`mini-staff ${notation}`}>𝄞　♩　♪　♫　♬　♩</div></div><h2 className="settings-title">Interface settings</h2><div className="theme-options">{["light","dark","contrast"].map(t=><button className={theme===t?"selected":""} onClick={()=>setTheme(t)} key={t}><span className={`theme-swatch ${t}`}/>{t==="contrast"?"High contrast":t[0].toUpperCase()+t.slice(1)}</button>)}</div><div className="setting-row"><div><strong>Interface font size</strong><p>Adjust text size across Piano Coach.</p></div><select onChange={()=>toast("Font size preference saved.")} defaultValue="normal"><option value="normal">Standard</option><option>Large</option><option>Extra large</option></select></div></div>}
    {profileTab==="account"&&<div className="panel profile-panel"><h2>Account & billing</h2><div className="billing-card"><div><span className="eyebrow">CURRENT PLAN</span><h3>Basic <span>£9.99 / month</span></h3><p>Your next renewal date will appear here.</p></div><span className="soft-badge">ACTIVE</span></div><div className="setting-row"><div><strong>Change password</strong><p>Update the password used to sign in.</p></div><Button kind="outline" onClick={()=>toast("Password change flow will be connected.")}>Change password</Button></div><div className="setting-row"><div><strong>Cancel subscription</strong><p>Manage your recurring payment through Stripe.</p></div><button className="text-link" onClick={()=>toast("Stripe customer portal will open here.")}>Manage billing ↗</button></div><div className="danger-zone"><div><strong>Delete account</strong><p>Account deletion includes a 15-day cancellation period before permanent removal.</p></div><Button kind="danger" onClick={()=>toast("Identity confirmation is required before account deletion.")}>Delete account</Button></div></div>}
  </>;
}
function Field({label,value}) { return <label className="field"><span>{label}</span><input defaultValue={value}/></label>; }
function Admin({toast}) { const [codes,setCodes]=useState([]); const [code,setCode]=useState(""); const [discount,setDiscount]=useState("10"); return <><PageHeading eyebrow="PIANO COACH" title="Admin" subtitle="Manage the platform and promotional access."/><div className="admin-warning">Admin tools are a design preview. Access control and all actions must be enforced by the PocketBase backend before launch.</div><div className="stats-grid"><Stat label="REGISTERED STUDENTS" value="—" note="Awaiting backend connection" icon="♙"/><Stat label="ACTIVE SUBSCRIPTIONS" value="—" note="Stripe not connected" icon="↻"/><Stat label="DISCOUNT CODES" value={String(codes.length)} note="Created in this preview" icon="%"/><Stat label="SYSTEM STATUS" value="Preview" note="Backend setup pending" icon="⌁"/></div><div className="panel admin-panel"><h2>Discount code generator</h2><p>Create a code for a specific student or a wider promotion.</p><div className="admin-form"><Field label="Discount code" value={code}/><label className="field"><span>Discount</span><select value={discount} onChange={e=>setDiscount(e.target.value)}><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option><option value="25">25%</option><option value="50">50%</option></select></label><Button onClick={()=>{const v=code.trim()||`PIANO${Math.random().toString(36).slice(2,7).toUpperCase()}`;setCodes(a=>[...a,{code:v,discount}]);setCode("");toast("Preview discount code created.");}}>＋ Generate code</Button></div>{codes.map((c,i)=><div className="code-row" key={i}><strong>{c.code}</strong><span>{c.discount}% off</span><button onClick={()=>navigator.clipboard?.writeText(c.code).then(()=>toast("Code copied."))}>Copy</button></div>)}</div></>; }

function FieldDummy() {}
