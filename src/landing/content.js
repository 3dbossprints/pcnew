export const PLANS = [
  {
    id: "free",
    name: "Free Demo",
    price: "£0",
    period: "lifetime",
    blurb: "Try assisted practice with a 60-minute lifetime allowance.",
    features: ["60 min lifetime practice", "Assisted Practice mode", "Standard Practice mode", "1 score in your library", "Basic mistake feedback"],
    cta: "Start free",
    highlight: false,
  },
  {
    id: "basic",
    name: "Basic",
    price: "£9.99",
    period: "per month",
    blurb: "Everything you need for structured, daily practice.",
    features: ["Unlimited practice time", "Assisted + Standard Practice", "Grade Plan tracking", "Mistake feedback & scoring", "Practice streaks", "Full score library"],
    cta: "Choose Basic",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "£19.99",
    period: "per month",
    blurb: "Complete preparation with every tool included.",
    features: ["Everything in Basic", "Full Grade Plan with pieces", "Scale & arpeggio library", "Section-level progress tracking", "Exam book upload & reference", "Priority email support"],
    cta: "Choose Pro",
    highlight: true,
  },
];

export const FEATURES = [
  { icon: "♪", title: "Assisted Practice", desc: "Real-time note detection shows you exactly where to focus, with instant visual feedback as you play.", size: "wide" },
  { icon: "♫", title: "Standard Practice", desc: "Free-form sessions with a stopwatch, metronome and your own scores. Perfect for rehearsing repertoire.", size: "" },
  { icon: "◎", title: "Grade Plan", desc: "Organise pieces, exercises and scales by section. Track your progress through every part of your syllabus.", size: "" },
  { icon: "✦", title: "Mistake Feedback", desc: "After each session, see which bars and notes need attention with a clear, encouraging breakdown.", size: "wide" },
  { icon: "◷", title: "Practice Streaks", desc: "Build a daily habit. Your dashboard shows your streak, weekly time and progress toward your 15-minute goal.", size: "" },
  { icon: "♬", title: "Scale Library", desc: "A searchable library of scales and arpeggios with fingering guidance, aligned to your exam board.", size: "" },
];

export const STEPS = [
  { title: "Set your grade", desc: "Choose your exam board and grade. Piano Coach tailors everything to your syllabus." },
  { title: "Add your music", desc: "Upload MusicXML scores, PDFs and exam books. Build a library that follows you everywhere." },
  { title: "Practise with feedback", desc: "Play along with real-time note tracking. Get instant feedback on timing and accuracy." },
  { title: "Track your progress", desc: "Watch your streaks grow, your scores improve and your Grade Plan come together." },
];

export const MARQUEE_WORDS = ["Listen deeply", "Practise intentionally", "Play with confidence", "Grade-aware plans", "Real-time feedback"];

export const STAFF_LINES = [22, 30, 38, 46, 54];
export const STAFF_NOTES = [
  { x: 78, y: 50 }, { x: 120, y: 45 }, { x: 162, y: 40 },
  { x: 204, y: 35 }, { x: 246, y: 40 }, { x: 288, y: 45 },
];
export const MISTAKES = [
  { bar: 4, x: 60, noteIndex: 1, note: "E♭ played as E natural" },
  { bar: 9, x: 146, noteIndex: 3, note: "Left hand rushed the offbeat" },
  { bar: 14, x: 232, noteIndex: 5, note: "G♯ released too early" },
];
