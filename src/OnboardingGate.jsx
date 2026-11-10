import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
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
  const [billingInterval, setBillingInterval] = useState("monthly");
  const [checkoutClientSecret, setCheckoutClientSecret] = useState("");
  const checkoutMountRef = useRef(null);
  const [paymentConfirming, setPaymentConfirming] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  const [bookCategory, setBookCategory] = useState("repertoire");
  const [bookChoice, setBookChoice] = useState("skip");
  const [examBookUploaded, setExamBookUploaded] = useState(false);
  const [bookUploadBusy, setBookUploadBusy] = useState(false);
  const [bookUploadName, setBookUploadName] = useState("");
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
        if (body.user.pending_plan) {
          setPlan(body.user.pending_plan);
          setBillingInterval(body.user.pending_interval || "monthly");
          setStep(3);
          const savedBook = Array.isArray(body.user.book_sources) ? body.user.book_sources[0] : null;
          if (savedBook) { setBookTitle(savedBook.title || ""); setBookUrl(savedBook.url || ""); setBookCategory(savedBook.category || "repertoire"); }
        }
        if (body.user.target_date) setTargetDate(String(body.user.target_date).slice(0,10));
        if (body.user.exam_book_file_id) { setExamBookUploaded(true); setBookChoice("own"); }
      } catch (e) {
        if (active) setError(e.message || "We couldn't connect to your account.");
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!checkoutClientSecret || !checkoutMountRef.current) return undefined;
    let cancelled = false;
    let embedded;
    async function mountCheckout() {
      try {
        const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
        if (!publishableKey) throw new Error("Stripe test publishable key is not configured in Vercel.");
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error("Stripe.js could not be loaded.");
        embedded = await stripe.initEmbeddedCheckout({ clientSecret: checkoutClientSecret });
        if (!cancelled && checkoutMountRef.current) embedded.mount(checkoutMountRef.current);
      } catch (error) {
        if (!cancelled) setError(error.message || "Secure checkout couldn't be loaded.");
      }
    }
    mountCheckout();
    return () => { cancelled = true; if (embedded) embedded.unmount(); };
  }, [checkoutClientSecret]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if ((!sessionId && !profile?.pending_plan) || !profile || profile.onboarding_completed) return undefined;
    let active = true;
    setPaymentConfirming(true);
    async function confirmPayment() {
      for (let attempt = 0; attempt < 12 && active; attempt += 1) {
        try {
          const token = await auth.currentUser.getIdToken(true);
          const confirmation = await fetch("/api/billing/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify(sessionId ? { sessionId } : {}),
          });
          const confirmationBody = await confirmation.json().catch(() => ({}));
          if (confirmation.ok) {
            const refreshed = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } });
            const refreshedBody = await refreshed.json();
            if (refreshed.ok && refreshedBody.user?.onboarding_completed) {
              if (active) {
                setProfile(refreshedBody.user);
                setPaymentConfirming(false);
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete("checkout");
                cleanUrl.searchParams.delete("session_id");
                window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
              }
              return;
            }
          } else if (confirmation.status !== 202 && confirmation.status !== 503) {
            throw new Error(confirmationBody.error || "We couldn't verify this checkout session.");
          }
        } catch (error) {
          if (active && error.message && !error.message.includes("fetch")) {
            setPaymentConfirming(false);
            setError(error.message);
            return;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      if (active) {
        setPaymentConfirming(false);
        setError("Your payment was submitted, but Stripe is taking longer than expected to confirm it. Your access will unlock as soon as confirmation completes. Please contact support if this continues.");
      }
    }
    confirmPayment();
    return () => { active = false; };
  }, [profile?.onboarding_completed, profile?.pending_plan]);

  async function uploadExamBook(file) {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["pdf", "epub"].includes(ext)) { setError("Please choose a PDF or EPUB exam-board ebook."); return; }
    if (file.size > 25 * 1024 * 1024) { setError("The ebook must be 25 MB or smaller."); return; }
    setBookUploadBusy(true); setError(""); setBookUploadName(file.name);
    try {
      const token = await auth.currentUser.getIdToken();
      const signedResponse = await fetch("/api/uploads/sign", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ filename: file.name, contentType: file.type || (ext === "pdf" ? "application/pdf" : "application/epub+zip"), size: file.size, purpose: "exam_book" }) });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed.error || "The ebook upload could not be prepared.");
      const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || (ext === "pdf" ? "application/pdf" : "application/epub+zip") }, body: file });
      if (!put.ok) throw new Error("The ebook could not be uploaded to secure storage. Please try again.");
      const completeResponse = await fetch("/api/uploads/complete", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ fileId: signed.fileId, purpose: "exam_book" }) });
      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.error || "The ebook upload could not be verified.");
      setExamBookUploaded(true); setBookChoice("own"); setBookTitle(file.name.replace(/\\.(pdf|epub)$/i, ""));
    } catch (uploadError) { setError(uploadError.message || "The ebook upload failed."); }
    finally { setBookUploadBusy(false); }
  }

  async function finish() {
    setError("");
    if (plan !== "free" && bookChoice === "own" && !examBookUploaded) { setError("Please upload your PDF or EPUB, or choose Skip for now."); return; }
    setSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const bookSources = plan === "free" || !bookTitle.trim() || !/^https:\/\//i.test(bookUrl.trim()) ? [] : [{ title: bookTitle.trim(), url: bookUrl.trim(), category: bookCategory }];
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ examBoard, grade, plan, interval: billingInterval, targetDate, bookSources, examBookSkipped: plan !== "free" && !examBookUploaded }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your choices couldn't be saved.");
      setProfile(body.user);
      if (plan !== "free") {
        const checkoutResponse = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ plan, interval: billingInterval }),
        });
        const checkoutBody = await checkoutResponse.json();
        if (!checkoutResponse.ok) throw new Error(checkoutBody.error || "Secure checkout couldn't be started.");
        setCheckoutClientSecret(checkoutBody.clientSecret);
      }
    } catch (e) { setError(e.message || "Your choices couldn't be saved. Please try again."); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="auth-screen"><section className="auth-card"><div className="auth-mark">𝄞</div><p>Preparing your musical journey…</p></section></main>;
  if (profile?.onboarding_completed) return children;

  if (checkoutClientSecret) return <main className="onboarding-screen">
    <header className="onboarding-brand"><div className="auth-mark">𝄞</div><div><strong>Piano <em>Coach</em></strong><small>SECURE CHECKOUT</small></div></header>
    <section className="onboarding-card checkout-card">
      <p className="eyebrow">ALMOST THERE</p><h1>Complete your subscription.</h1>
      <p className="onboarding-intro">Your selected {plan === "pro" ? "Pro" : "Basic"} subscription is ready. Payment details are handled securely by Stripe.</p>
      <div className="demo-explainer"><span>!</span><div><strong>Your exam-board ebook is purchased separately.</strong><p>The subscription price shown here covers Piano Coach only. It does not include your exam-board ebook. If you have not uploaded it, you will need to buy it separately from an authorised retailer and upload it later. Graded learning stays locked until then. Pro Extras and your own uploaded pieces remain available with Pro.</p></div></div>
      {error && <p className="auth-message" role="alert">{error}</p>}
      <div className="embedded-checkout" ref={checkoutMountRef}/>
      <button type="button" className="auth-text-button" onClick={()=>setCheckoutClientSecret("")}>Back to your plan details</button>
    </section>
    <p className="onboarding-foot">Secure payment powered by Stripe.</p>
  </main>;

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
        <p className="eyebrow">CHOOSE YOUR EXPERIENCE</p><h1>Let's find the right way to learn.</h1><p className="onboarding-intro">Start with a free one-hour taster or choose a monthly or annual plan.</p>
        <div className="billing-interval-picker"><button type="button" className={billingInterval==="monthly"?"chosen":""} onClick={()=>setBillingInterval("monthly")}>Monthly</button><button type="button" className={billingInterval==="annual"?"chosen":""} onClick={()=>setBillingInterval("annual")}>Annual · one month free</button></div>
        <div className="plan-options">
          <button type="button" className={plan==="free"?"plan-option chosen":"plan-option"} onClick={()=>setPlan("free")}><span className="plan-top"><strong>Free demo</strong><b>£0</b></span><span className="plan-desc">60 minutes of practice for the lifetime of your account. No exam books required.</span><small>Limited demo songs · No payment details</small></button>
          <button type="button" className={plan==="basic"?"plan-option chosen":"plan-option"} onClick={()=>setPlan("basic")}><span className="plan-top"><strong>Basic</strong><b>{billingInterval === "monthly" ? "£9.99" : "£109.89"}<small>/{billingInterval === "monthly" ? "month" : "year"}</small></b></span><span className="plan-desc">Core learning tools with on-device AI and your own exam-board books.</span><small>Local AI · Grade plan · Practice feedback</small></button>
          <button type="button" className={plan==="pro"?"plan-option chosen":"plan-option"} onClick={()=>setPlan("pro")}><span className="plan-top"><strong>Pro</strong><b>{billingInterval === "monthly" ? "£19.99" : "£219.89"}<small>/{billingInterval === "monthly" ? "month" : "year"}</small></b></span><span className="plan-desc">Everything in Basic, plus faster cloud AI and creative Extras.</span><small>Cloud AI · Extras · Advanced tools</small></button>
        </div>
        {plan!=="free" && <p className="onboarding-note">{billingInterval === "annual" ? "Annual billing is charged upfront, with one month free." : "Billed monthly. You can manage or cancel your subscription from your account."} Payment is processed securely by Stripe.</p>}
      </>}
      {step === 3 && <>
        <p className="eyebrow">YOUR LEARNING MATERIALS</p><h1>Which books will you be using?</h1>
        {plan==="free" ? <div className="demo-explainer"><span>✧</span><div><strong>Your free hour starts with no books.</strong><p>We'll give you a small selection of demo pieces. You can add your own exam-board book whenever you're ready to upgrade.</p></div></div> : <>
          <p className="onboarding-intro">Your exam-board ebook is separate from your Piano Coach subscription. Choose whether to upload a copy you already own, buy it first, or skip this step and add it later.</p>
          <div className="onboarding-options">
            <button type="button" className={bookChoice==="own"?"chosen":""} onClick={()=>{setBookChoice("own");document.getElementById("exam-book-upload")?.click();}}><strong>I already own the ebook</strong><span>Upload your PDF or EPUB copy</span></button>
            <button type="button" className={bookChoice==="buy"?"chosen":""} onClick={()=>setBookChoice("buy")}><strong>I need to buy the ebook</strong><span>Find it through an authorised retailer first</span></button>
            <button type="button" className={bookChoice==="skip"?"chosen":""} onClick={()=>setBookChoice("skip")}><strong>Skip for now</strong><span>I'll purchase and upload it later</span></button>
          </div>
          <input id="exam-book-upload" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" hidden disabled={bookUploadBusy} onChange={e=>{uploadExamBook(e.target.files[0]);e.target.value="";}}/>
          {bookUploadBusy && <p className="onboarding-note">Uploading {bookUploadName}…</p>}
          {examBookUploaded && <p className="onboarding-note">✓ {bookTitle || "Exam-board ebook"} uploaded securely. Graded learning will be available after setup.</p>}
          {bookChoice==="buy" && <>
            <label className="onboarding-field"><span>Book type</span><select value={bookCategory} onChange={e=>setBookCategory(e.target.value)}><option value="repertoire">Repertoire</option><option value="scales">Scales</option><option value="sight-reading">Sight-reading</option><option value="technique">Technique</option></select></label>
            <label className="onboarding-field"><span>Book title</span><input value={bookTitle} onChange={e=>setBookTitle(e.target.value)} placeholder="e.g. ABRSM Piano Exam Pieces 2025–2026"/></label>
            <label className="onboarding-field"><span>Authorised retailer link (optional)</span><input type="url" value={bookUrl} onChange={e=>setBookUrl(e.target.value)} placeholder="https://…"/></label>
            <p className="onboarding-note">Purchase the ebook directly from the retailer. It is not included in your Piano Coach subscription or charged by Piano Coach.</p>
          </>}
          {bookChoice==="skip" && <p className="onboarding-note">You can continue without the ebook. Your dashboard and Profile will remain available. Graded exam pieces, exercises and scales stay locked until you upload the required ebook. Pro users can still use Extras in the Pieces section to upload and practise their own music.</p>}
        </>}
        {paymentConfirming && <p className="onboarding-note">Payment received. Waiting for secure confirmation from Stripe…</p>}
        <label className="onboarding-field target-date"><span>Target exam date (optional)</span><input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label>
      </>}
      {error && <p className="auth-message" role="alert">{error}</p>}
      <div className="onboarding-actions">
        {step>0 && <button type="button" className="button outline" onClick={()=>{setError("");setStep(v=>v-1);}}>Back</button>}
        <span/>
        {step<3 ? <button type="button" className="button primary" onClick={()=>{setError("");setStep(v=>v+1);}}>Continue <b>→</b></button> :
          <button type="button" className="button primary" disabled={saving} onClick={finish}>{saving ? "Preparing secure checkout…" : plan === "free" ? "Finish setup →" : "Continue to secure checkout →"}</button>}
      </div>
    </section>
    <p className="onboarding-foot">A thoughtful practice plan, made around you.</p>
  </main>;
}
