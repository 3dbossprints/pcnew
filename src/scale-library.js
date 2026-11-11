const majorKeys = [
  "C","G","D","A","E","B","F♯","C♯","F","B♭","E♭","A♭","D♭","G♭","C♭"
];
const minorKeys = [
  "A","E","B","F♯","C♯","G♯","D♯","A♯","D","G","C","F","B♭","E♭","A♭",
  "C♭","F♭","E♯","B♯"
];
const chromaticRoots = ["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];
const families = [];
const slugKey = value => String(value).toLowerCase().replace(/♭/g,"b").replace(/♯/g,"sharp").replace(/[^a-z0-9]+/g,"");
const addFamily = (name, keys, group, options = {}) => {
  keys.forEach(key => families.push({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+slugKey(key),
    title: key+" "+name+(options.motion ? " · "+options.motion : ""),
    key, family:name, group, motion:options.motion||"Similar motion",
    hands:options.hands||"Hands together", octaves:options.octaves||2,
    level:options.level||"Core", syllabusMatches:[],
  }));
};

["Major","Natural minor","Harmonic minor","Melodic minor"].forEach(type =>
  addFamily(type,type==="Major"?majorKeys:minorKeys,"Scales",{level:type==="Major"||type==="Natural minor"?"Core":"Developing"})
);
majorKeys.forEach(key=>families.push({
  id:"contrary-major-"+slugKey(key),
  title:key+" major · contrary motion",key,family:"Major",group:"Contrary motion",
  motion:"Contrary motion",hands:"Both hands",octaves:2,level:"Developing",syllabusMatches:[]
}));
minorKeys.forEach(key=>families.push({
  id:"contrary-minor-"+slugKey(key),
  title:key+" minor · contrary motion",key,family:"Natural minor",group:"Contrary motion",
  motion:"Contrary motion",hands:"Both hands",octaves:2,level:"Developing",syllabusMatches:[]
}));
["Chromatic","Major pentatonic","Minor pentatonic","Blues"].forEach(type =>
  addFamily(type,chromaticRoots,"Scales",{level:type==="Chromatic"?"Core":"Advanced"})
);
["Whole tone","Diminished (whole–half)","Diminished (half–whole)","Augmented","Double harmonic","Hungarian minor","Neapolitan minor","Neapolitan major","Persian"].forEach(type =>
  addFamily(type,["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"],"Advanced scales",{level:"Advanced"})
);
["Dorian","Phrygian","Lydian","Mixolydian","Aeolian","Locrian"].forEach(type =>
  addFamily(type,chromaticRoots,"Modes",{level:"Advanced"})
);
["Major arpeggio","Diminished arpeggio","Augmented arpeggio","Dominant seventh arpeggio"].forEach(type =>
  addFamily(type,majorKeys,"Arpeggios",{level:type.includes("seventh")?"Advanced":"Core"})
);
["Minor arpeggio","Diminished seventh arpeggio"].forEach(type =>
  addFamily(type,minorKeys,"Arpeggios",{level:"Advanced"})
);
["Major broken chord","Dominant seventh broken chord"].forEach(type =>
  addFamily(type,majorKeys,"Broken chords",{level:"Developing"})
);
["Minor broken chord"].forEach(type =>
  addFamily(type,minorKeys,"Broken chords",{level:"Developing"})
);
["Diminished seventh broken chord"].forEach(type =>
  addFamily(type,chromaticRoots,"Broken chords",{level:"Advanced"})
);
["Major scale in thirds","Major scale in sixths"].forEach(type =>
  addFamily(type,majorKeys,"Scales in intervals",{level:"Advanced"})
);
["Minor scale in thirds","Minor scale in sixths"].forEach(type =>
  addFamily(type,minorKeys,"Scales in intervals",{level:"Advanced"})
);

export const SCALE_LIBRARY = families;

function normalise(value) {
  return String(value||"").toLowerCase()
    .replace(/♭/g,"b").replace(/flat/g,"b")
    .replace(/♯/g,"#").replace(/sharp/g,"#")
    .replace(/minor/g,"min").replace(/major/g,"maj")
    .replace(/contrary motion/g,"contrary");
}

export function searchScales(query, examBoard, grade) {
  const q=normalise(query).trim();
  const board=normalise(examBoard);
  const gradeKey=String(grade||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  return SCALE_LIBRARY.map(item=>{
    const matches=Array.isArray(item.syllabusMatches)?item.syllabusMatches:[];
    const exact=matches.some(match=>
      normalise(match.examBoard)===board &&
      String(match.grade||"").toLowerCase().replace(/[^a-z0-9]/g,"")===gradeKey
    );
    const text=normalise([item.title,item.key,item.family,item.group,item.level].join(" "));
    return {...item,examMatch:exact,searchText:text};
  }).filter(item=>{
    if(!q)return true;
    // Match all meaningful query terms independently so "C♭ minor" also finds
    // catalogue titles such as "C♭ Natural minor".
    const terms=q.match(/[a-z0-9#]+/g)||[];
    return terms.every(term=>item.searchText.includes(term));
  }).sort((a,b)=>Number(b.examMatch)-Number(a.examMatch)||a.title.localeCompare(b.title));
}
