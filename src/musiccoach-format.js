import { buildKeystoneTimeline, parseKeystoneMusicXML } from "./keystone-engine.js";

export const MUSICCOACH_FORMAT = "musiccoach";
export const MUSICCOACH_VERSION = 1;

export function musicXmlToMusicCoach(xml, sourceFileId, sourceName = "") {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("The source score is empty.");
  const parsed = parseKeystoneMusicXML(xml);
  const timeline = buildKeystoneTimeline(parsed);
  if (!timeline.length) throw new Error("The score contains no playable notes.");
  return {
    format: MUSICCOACH_FORMAT,
    version: MUSICCOACH_VERSION,
    source: { fileId: sourceFileId || null, fileName: sourceName, format: "musicxml" },
    tempo: parsed.bpm || 120,
    timeSignature: "4/4",
    measures: parsed.measures.map(measure => ({
      number: Number(measure.number) || 1,
      length: Number(measure.length) || 4,
      bpm: Number(measure.bpm) || parsed.bpm || 120,
    })),
    notes: timeline.map(note => ({
      midi: note.midi,
      note: note.note,
      time: Number(note.t.toFixed(5)),
      duration: Number(note.d.toFixed(5)),
      hand: note.hand,
      measure: note.measure,
      orderIndex: note.orderIndex,
      noteIndex: note.noteIndex,
    })),
    recognition: {
      engine: "musicxml-import",
      confidence: 1,
      requiresReview: false,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function parseMusicCoachFile(input) {
  let data;
  try { data = typeof input === "string" ? JSON.parse(input) : input; }
  catch { throw new Error("This MusicCoach analysis file is not valid JSON."); }
  if (!data || data.format !== MUSICCOACH_FORMAT || data.version !== MUSICCOACH_VERSION) {
    throw new Error("This MusicCoach file uses an unsupported format version.");
  }
  if (!Array.isArray(data.notes) || !data.notes.length) throw new Error("This MusicCoach file contains no recognised notes.");
  const notes = data.notes.map((note, index) => {
    const midi = Number(note.midi);
    const time = Number(note.time);
    const duration = Number(note.duration);
    if (!Number.isInteger(midi) || midi < 0 || midi > 127 || !Number.isFinite(time) || time < 0 ||
        !Number.isFinite(duration) || duration <= 0) {
      throw new Error("The MusicCoach file contains an invalid note at position " + (index + 1) + ".");
    }
    return {
      midi, note: typeof note.note === "string" ? note.note : undefined,
      time, duration, hand: note.hand === "left" ? "left" : "right",
      measure: Math.max(1, Number(note.measure) || 1),
      orderIndex: Number.isInteger(note.orderIndex) ? note.orderIndex : 0,
      noteIndex: Number.isInteger(note.noteIndex) ? note.noteIndex : index,
    };
  });
  return { ...data, notes };
}
