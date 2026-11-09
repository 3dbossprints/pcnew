import { useEffect, useState } from "react";
import { auth } from "./lib/firebase.js";

const boards = ["RSL Awards", "ABRSM", "LCME", "Trinity College London", "MTB", "VCM", "NCM"];
const grades = ["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"];

export default function OnboardingGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [step, setStep] = useState(0);
  const [examBoard, setExamBoard] = useState("ABRSM");
  const [grade, setGrade] = useState("Grade 1");
  const [plan, setPlan] = useState("free");
  const [targetDate, setTargetDate] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  const [bookCategory, setBookCategory] = useState("repertoire");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const current = auth?.currentUser;
        if (!current) { if (active) setLoading(false); return; }
        const token = await current.getIdToken();
        const response = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "We couldn't load your profile.");
        if (!active) return;
        setProfile(body.user);
        if (body.user.exam_board) setExamBoard(body.user.exam_board);
        if (body.user.grade) setGrade(body.user.grade);
        if (body.user.plan) setPlan(body.user.plan);
        if (body.user.target_date) setTargetDate(String(body.user.target_date).slice(0,10));
      } catch (e) {
        if (active) setError(e.message || "We couldn't connect to your account.");
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  async function finish() {
    setError("");
    if (plan !== "free" && (!bookTitle.trim() || !/^https:\/\//i.test(bookUrl.trim()))) {
      setError("For a paid plan, add a book title and a secure https:// retailer or book link.");
      setStep(3);
      return;
    }
    setSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const bookSources = plan === "free" ? [] : [{ title: bookTitle.trim(), url: bookUrl.trim(), category: bookCategory }];
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ examBoard, grade, plan, targetDate, bookSources }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your choices couldn't be saved.");
      setProfile(body.user);
    } catch (e) { setError(e.message || "Your choices couldn't be saved. Please try again."); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="auth-screen"><section className="auth-card"><div className="auth-mark">𝄞</div><p>Preparing your musical journey…</p></section></main>;
  if (profile?.onboarding_completed) return children;

  return <main className="onboarding-screen">
    <header className="onboarding-brand"><div className="auth-mark">𝄞</div><div><strong>Piano <em>Coach</em></strong><small>YOUR MUSICAL JOURNEY</small></div></header>
    <section className="onboarding-card">
      <div className="onboarding-progress"><span>GETTING STARTED</span><strong>STEP {step + 1} OF 4</strong></div>
      <div className="onboarding-track"><i style={{width:((step+1)*25)+"%"}}/></div>
      {step === 0 && <>
        <p className="eyebrow">YOUR EXAM PATH</p><h1>Which exam board are you following?</h1><p className="onboarding-intro">We'll shape your grade plan around the syllabus you're working towards.</p>
        <div className="onboarding-options board-options">{boards.map(board=><button type="button" key={board} className={examBoard===board?"chosen":""} onClick={()=>setExamBoard(board)}>{board}<span>{examBoard===board?"✓":"＋"}</span></button>)}</div>
      </>}
      {step === 1 && <>
        <p className="eyebrow">YOUR CURRENT LEVEL</p><h1>Where are you on your piano journey?</h1><p className="onboarding-intro">Choose your current grade. You can change this later in your profile.</p>
        <div className="grade-choice-grid">{grades.map(item=><button type="button" key={item} className={grade===item?"chosen":""} onClick={()=>setGrade(item)}>{item}</button>)}</div>
      </>}
      {step === 2 && <>
        <p className="eyebrow">CHOOSE YOUR EXPERIENCE</p><h1>Let's find the right way to learn.</h1><p className="onboarding-intro">Start with a free one-hour taster or choose a monthly plan.</p>
        <div className="plan-options">
          <button type="button" className={plan==="free"?"plan-option chosen":"plan-option"} onClick={()=>setPlan("free")}><span className="plan-top"><strong>Free demo</strong><b>£0</b></span><span className="plan-desc">60 minutes of practice for the lifetime of your account. No exam books required.</span><small>Limited demo songs · No payment details</small></button>
          <button type="button" className={plan==="basic"?"plan-option chosen":"plan-option"} onClick={()=>setPlan("basic")}><span className="plan-top"><strong>Basic</strong><b>£9.99<small>/month</small></b></span><span className="plan-desc">Core learning tools with on-device AI and your own exam-board books.</span><small>Local AI · Grade plan · Practice feedback</small></button>
          <button type="button" className={plan==="pro"?"plan-option chosen":"plan-option"} onClick={()=>setPlan("pro")}><span className="plan-top"><strong>Pro</strong><b>£19.99<small>/month</small></b></span><span className="plan-desc">Everything in Basic, plus faster cloud AI and creative Extras.</span><small>Cloud AI · Extras · Advanced tools</small></button>
        </div>
        {plan!=="free" && <p className="onboarding-note">This records your plan preference. Secure checkout will be added before paid subscriptions can be activated; you will not be charged here.</p>}
      </>}
      {step === 3 && <>
        <p className="eyebrow">YOUR LEARNING MATERIALS</p><h1>Which books will you be using?</h1>
        {plan==="free" ? <div className="demo-explainer"><span>✧</span><div><strong>Your free hour starts with no books.</strong><p>We'll give you a small selection of demo pieces. You can add your own exam-board books whenever you're ready to upgrade.</p></div></div> : <>
          <p className="onboarding-intro">Add a reference to a book you already own or a trusted retailer listing. We don't host or redistribute copyrighted books.</p>
          <label className="onboarding-field"><span>Book type</span><select value={bookCategory} onChange={e=>setBookCategory(e.target.value)}><option value="repertoire">Repertoire</option><option value="scales">Scales</option><option value="sight-reading">Sight-reading</option><option value="technique">Technique</option></select></label>
          <label className="onboarding-field"><span>Book title</span><input value={bookTitle} onChange={e=>setBookTitle(e.target.value)} placeholder="e.g. ABRSM Piano Exam Pieces 2025–2026"/></label>
          <label className="onboarding-field"><span>Book link (secure https:// address)</span><input type="url" value={bookUrl} onChange={e=>setBookUrl(e.target.value)} placeholder="https://…"/></label>
          <p className="onboarding-note">You can upload your own PDF or EPUB from Sheet Music after onboarding. Only upload material you have the right to use.</p>
        </>}
        <label className="onboarding-field target-date"><span>Target exam date (optional)</span><input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label>
      </>}
      {error && <p className="auth-message" role="alert">{error}</p>}
      <div className="onboarding-actions">
        {step>0 && <button type="button" className="button outline" onClick={()=>{setError("");setStep(v=>v-1);}}>Back</button>}
        <span/>
        {step<3 ? <button type="button" className="button primary" onClick={()=>{setError("");setStep(v=>v+1);}}>Continue <b>→</b></button> :
          <button type="button" className="button primary" disabled={saving} onClick={finish}>{saving?"Saving your choices…":"Finish setup →"}</button>}
      </div>
    </section>
    <p className="onboarding-foot">A thoughtful practice plan, made around you.</p>
  </main>;
}
