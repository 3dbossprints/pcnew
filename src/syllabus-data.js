const BOARDS = [
  "RSL Awards",
  "ABRSM",
  "LCME",
  "Trinity College London",
  "MTB",
  "VCM",
  "NCM",
];

const gradeKeys = [
  "Initial",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
];

function match(board, grade, family, keys, options = {}) {
  return keys.map(key => ({
    examBoard: board,
    grade,
    family,
    key,
    motion: options.motion || "Similar motion",
    hands: options.hands || "Hands together",
    octaves: options.octaves || 2,
    group: options.group || "Scales",
  }));
}

function matchAll(board, grade, entries) {
  return entries.map(entry => ({
    examBoard: board,
    grade,
    family: entry.family,
    key: entry.key,
    motion: entry.motion || "Similar motion",
    hands: entry.hands || "Hands together",
    octaves: entry.octaves || 2,
    group: entry.group || "Scales",
  }));
}

const majorFlat = ["C", "G", "D", "A", "E", "B", "F"];
const majorSharp = ["C", "G", "D", "A", "E", "F"];
const minorFlat = ["A", "E", "B", "D", "G", "C", "F"];
const minorSharp = ["A", "E", "B", "F♯", "C♯"];
const easyKeys = ["C", "G", "D", "F"];
const easyMinors = ["A", "E", "D"];
const earlyMajors = ["C", "G", "D", "A", "E", "F"];
const earlyMinors = ["A", "E", "B", "D", "G", "C"];
const midMajors = ["C", "G", "D", "A", "E", "B", "F", "B♭", "E♭", "A♭"];
const midMinors = ["A", "E", "B", "D", "G", "C", "F", "B♭", "E♭", "G♯"];
const lateMajors = ["C", "G", "D", "A", "E", "B", "F♯", "C♯", "F", "B♭", "E♭", "A♭", "D♭", "G♭"];
const lateMinors = ["A", "E", "B", "F♯", "C♯", "G♯", "D♯", "D", "G", "C", "F", "B♭", "E♭", "A♭"];

const chromaticRoots = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

// ABRSM — the most widely used board. Requirements are well documented.
const abrsm = [
  ...matchAll("ABRSM", "Grade 1", [
    ...majorFlat.slice(0, 4).map(k => ({ family: "Major", key: k, group: "Scales" })),
    ...easyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales" })),
    ...easyKeys.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios" })),
    ...easyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios" })),
  ]),
  ...matchAll("ABRSM", "Grade 2", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales" })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales" })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios" })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios" })),
  ]),
  ...matchAll("ABRSM", "Grade 3", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...["A", "D"].map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...["C", "G", "D"].map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 1 })),
  ]),
  ...matchAll("ABRSM", "Grade 4", [
    ...midMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...["A", "E", "B", "D", "G"].map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...["C", "G", "D", "A"].map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 1 })),
    ...chromaticRoots.slice(0, 6).map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("ABRSM", "Grade 5", [
    ...midMajors.concat(["B♭", "E♭", "A♭"]).map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["B♭", "E♭", "A♭"]).map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["B♭", "E♭"]).map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.concat(["B♭", "E♭"]).map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMajors.slice(0, 6).map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("ABRSM", "Grade 6", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2, hands: "Hands together" })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2, hands: "Hands together" })),
    ...lateMajors.slice(0, 8).map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...["C", "G", "D", "A", "E"].map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("ABRSM", "Grade 7", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 8).map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...lateMinors.slice(0, 8).map(k => ({ family: "Natural minor", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("ABRSM", "Grade 8", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Natural minor", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Whole tone", key: k, group: "Advanced scales", octaves: 2 })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Major", key: k, group: "Scales in intervals", motion: "In thirds", octaves: 2, hands: "Hands separately" })),
  ]),
];

// Trinity College London — similar structure, slightly different keys per grade
const trinity = [
  ...matchAll("Trinity College London", "Initial", [
    ...["C", "G", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("Trinity College London", "Grade 1", [
    ...["C", "G", "D", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G", "F"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A", "D"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("Trinity College London", "Grade 2", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("Trinity College London", "Grade 3", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...["A", "E"].map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...["C", "G"].map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 1 })),
  ]),
  ...matchAll("Trinity College London", "Grade 4", [
    ...midMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...["A", "E", "B", "D"].map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...["C", "G", "D"].map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 1 })),
    ...chromaticRoots.slice(0, 4).map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("Trinity College London", "Grade 5", [
    ...midMajors.concat(["A♭"]).map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["B♭", "E♭"]).map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.concat(["B♭", "E♭"]).map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMajors.slice(0, 6).map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("Trinity College London", "Grade 6", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 8).map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("Trinity College London", "Grade 7", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 8).map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...lateMajors.slice(0, 4).map(k => ({ family: "Whole tone", key: k, group: "Advanced scales", octaves: 2 })),
  ]),
  ...matchAll("Trinity College London", "Grade 8", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Whole tone", key: k, group: "Advanced scales", octaves: 2 })),
    ...lateMajors.slice(0, 4).map(k => ({ family: "Diminished (whole–half)", key: k, group: "Advanced scales", octaves: 2 })),
    ...lateMajors.slice(0, 4).map(k => ({ family: "Major", key: k, group: "Scales in intervals", motion: "In thirds", octaves: 2, hands: "Hands separately" })),
  ]),
];

// LCME (London College of Music Examinations)
const lcme = [
  ...matchAll("LCME", "Grade 1", [
    ...["C", "G", "D", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A", "D"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("LCME", "Grade 2", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("LCME", "Grade 3", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("LCME", "Grade 4", [
    ...midMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...["C", "G"].map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 1 })),
  ]),
  ...matchAll("LCME", "Grade 5", [
    ...midMajors.concat(["A♭"]).map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["B♭"]).map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.concat(["B♭"]).map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.slice(0, 6).map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("LCME", "Grade 6", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("LCME", "Grade 7", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("LCME", "Grade 8", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Whole tone", key: k, group: "Advanced scales", octaves: 2 })),
  ]),
];

// RSL Awards — contemporary-focused, penta/scales + arpeggios
const rsl = [
  ...matchAll("RSL Awards", "Initial", [
    ...["C", "G"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A"].map(k => ({ family: "Natural minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G"].map(k => ({ family: "Major pentatonic", key: k, group: "Scales", octaves: 1 })),
    ...["A"].map(k => ({ family: "Minor pentatonic", key: k, group: "Scales", octaves: 1 })),
    ...["A"].map(k => ({ family: "Blues", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("RSL Awards", "Grade 1", [
    ...["C", "G", "D"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Natural minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G", "D"].map(k => ({ family: "Major pentatonic", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Minor pentatonic", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Blues", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A", "E"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("RSL Awards", "Grade 2", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Natural minor", key: k, group: "Scales", octaves: 1 })),
    ...earlyMajors.map(k => ({ family: "Major pentatonic", key: k, group: "Scales", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Minor pentatonic", key: k, group: "Scales", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Blues", key: k, group: "Scales", octaves: 1 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("RSL Awards", "Grade 3", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Natural minor", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Blues", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("RSL Awards", "Grade 4", [
    ...midMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Natural minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Blues", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMajors.slice(0, 4).map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("RSL Awards", "Grade 5", [
    ...midMajors.concat(["A♭"]).map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["A♭"]).map(k => ({ family: "Major pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Minor pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Blues", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["B♭"]).map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.concat(["B♭"]).map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMajors.slice(0, 6).map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("RSL Awards", "Grade 6", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Major pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor pentatonic", key: k, group: "Scales", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Blues", key: k, group: "Scales", octaves: 2 })),
    ...["D", "E", "F", "G", "A", "B"].map(k => ({ family: "Dorian", key: k, group: "Modes", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("RSL Awards", "Grade 7", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...["D", "E", "F", "G", "A", "B", "C"].map(k => ({ family: "Dorian", key: k, group: "Modes", octaves: 2 })),
    ...["E", "F", "G", "A", "B", "C"].map(k => ({ family: "Phrygian", key: k, group: "Modes", octaves: 2 })),
    ...["C", "G", "D", "A", "E"].map(k => ({ family: "Lydian", key: k, group: "Modes", octaves: 2 })),
    ...["G", "D", "A", "E", "B", "C"].map(k => ({ family: "Mixolydian", key: k, group: "Modes", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("RSL Awards", "Grade 8", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...chromaticRoots.map(k => ({ family: "Whole tone", key: k, group: "Advanced scales", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Diminished (whole–half)", key: k, group: "Advanced scales", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Diminished (half–whole)", key: k, group: "Advanced scales", octaves: 2 })),
    ...["D", "E", "F", "G", "A", "B", "C"].map(k => ({ family: "Dorian", key: k, group: "Modes", octaves: 2 })),
    ...["E", "F", "G", "A", "B", "C"].map(k => ({ family: "Phrygian", key: k, group: "Modes", octaves: 2 })),
    ...["C", "G", "D", "A", "E"].map(k => ({ family: "Lydian", key: k, group: "Modes", octaves: 2 })),
    ...["G", "D", "A", "E", "B", "C"].map(k => ({ family: "Mixolydian", key: k, group: "Modes", octaves: 2 })),
    ...["A", "E", "B", "F♯", "C♯", "D", "G", "C"].map(k => ({ family: "Aeolian", key: k, group: "Modes", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
];

// MTB (Music Teachers' Board) — flexible, similar to ABRSM in scope
const mtb = [
  ...matchAll("MTB", "Grade 1", [
    ...["C", "G", "D", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G", "F"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A", "D"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("MTB", "Grade 2", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("MTB", "Grade 3", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("MTB", "Grade 4", [
    ...midMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...["C", "G"].map(k => ({ family: "Major", key: k, group: "Contrary motion", motion: "Contrary motion", octaves: 1 })),
  ]),
  ...matchAll("MTB", "Grade 5", [
    ...midMajors.concat(["A♭"]).map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["B♭"]).map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.concat(["B♭"]).map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.slice(0, 6).map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("MTB", "Grade 6", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("MTB", "Grade 7", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("MTB", "Grade 8", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
    ...lateMajors.slice(0, 4).map(k => ({ family: "Whole tone", key: k, group: "Advanced scales", octaves: 2 })),
  ]),
];

// VCM (Victoria College of Music)
const vcm = [
  ...matchAll("VCM", "Grade 1", [
    ...["C", "G", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A", "D"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("VCM", "Grade 2", [
    ...["C", "G", "D", "A", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "B", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G", "D"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("VCM", "Grade 3", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("VCM", "Grade 4", [
    ...midMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("VCM", "Grade 5", [
    ...midMajors.concat(["A♭"]).map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["B♭"]).map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.concat(["B♭"]).map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.slice(0, 4).map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("VCM", "Grade 6", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("VCM", "Grade 7", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("VCM", "Grade 8", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
];

// NCM (National College of Music)
const ncm = [
  ...matchAll("NCM", "Grade 1", [
    ...["C", "G", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("NCM", "Grade 2", [
    ...["C", "G", "D", "A", "F"].map(k => ({ family: "Major", key: k, group: "Scales", octaves: 1 })),
    ...["A", "E", "D"].map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 1 })),
    ...["C", "G", "D"].map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
    ...["A", "E"].map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 1 })),
  ]),
  ...matchAll("NCM", "Grade 3", [
    ...earlyMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...earlyMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...earlyMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("NCM", "Grade 4", [
    ...midMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
  ]),
  ...matchAll("NCM", "Grade 5", [
    ...midMajors.concat(["A♭"]).map(k => ({ family: "Major", key: k, group: "Scales", octaves: 2 })),
    ...midMinors.concat(["F"]).map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 2 })),
    ...midMajors.concat(["B♭"]).map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...midMinors.concat(["B♭"]).map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.slice(0, 4).map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 1 })),
  ]),
  ...matchAll("NCM", "Grade 6", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("NCM", "Grade 7", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...lateMajors.slice(0, 6).map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 2 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
  ...matchAll("NCM", "Grade 8", [
    ...lateMajors.map(k => ({ family: "Major", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Harmonic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMinors.map(k => ({ family: "Melodic minor", key: k, group: "Scales", octaves: 4, hands: "Hands separately" })),
    ...lateMajors.map(k => ({ family: "Major arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Minor arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMajors.map(k => ({ family: "Dominant seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...lateMinors.map(k => ({ family: "Diminished seventh arpeggio", key: k, group: "Arpeggios", octaves: 4 })),
    ...chromaticRoots.map(k => ({ family: "Chromatic", key: k, group: "Scales", octaves: 2, hands: "Hands separately" })),
  ]),
];

const ALL_SYLLABUS_ENTRIES = [...abrsm, ...trinity, ...lcme, ...rsl, ...mtb, ...vcm, ...ncm];

export { ALL_SYLLABUS_ENTRIES, BOARDS, gradeKeys };
export default ALL_SYLLABUS_ENTRIES;
