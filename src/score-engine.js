/**
 * Piano Coach score engine.
 *
 * Pure timing and score utilities shared by Standard and Assisted Practice.
 * MusicXML parsing is deliberately kept separate from playback so a malformed
 * score cannot corrupt the transport clock or live input state.
 */

export const MIN_MIDI = 21;
export const MAX_MIDI = 108;
export const DEFAULT_TEMPO = 100;
export const BLACK_KEY_CLASSES = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiToName(value) {
  const midi = Number(value);
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function nameToMidi(value) {
  const match = String(value ?? '').trim().match(/^([A-Ga-g])([#♯b♭]?)(-?\d)$/);
  if (!match) return null;
  const accidental = match[2] === '#' || match[2] === '♯' ? 1 : match[2] === 'b' || match[2] === '♭' ? -1 : 0;
  const midi = 12 * (Number(match[3]) + 1) + NATURAL[match[1].toUpperCase()] + accidental;
  return Number.isInteger(midi) && midi >= 0 && midi <= 127 ? midi : null;
}

export function isBlackKey(midi) {
  return BLACK_KEY_CLASSES.has(((Number(midi) % 12) + 12) % 12);
}

/**
 * Convert arbitrary note events to a stable, sorted timeline.
 * Input time and duration are seconds. Duplicate event IDs are discarded.
 */
export function normaliseScoreEvents(input, { tempo = DEFAULT_TEMPO } = {}) {
  const safeTempo = clamp(Number(tempo) || DEFAULT_TEMPO, 20, 240);
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const events = [];

  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const midi = Number(raw.midi ?? nameToMidi(raw.note));
    if (!Number.isInteger(midi) || midi < MIN_MIDI || midi > MAX_MIDI) return;
    const start = Number(raw.time ?? raw.t);
    const duration = Number(raw.duration ?? raw.d);
    if (!Number.isFinite(start) || start < 0) return;
    const key = raw.id != null ? String(raw.id) : null;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    const hand = raw.hand === 'left' || raw.hand === 'right'
      ? raw.hand : (midi < 60 ? 'left' : 'right');
    events.push(Object.freeze({
      id: key || `event-${index}`,
      midi,
      note: midiToName(midi),
      t: start,
      d: clamp(Number.isFinite(duration) && duration > 0 ? duration : 60 / safeTempo, 0.04, 30),
      hand,
      measure: Math.max(1, Math.floor(Number(raw.measure) || 1)),
      beat: Number.isFinite(Number(raw.beat)) ? Number(raw.beat) : null,
      voice: raw.voice == null ? null : String(raw.voice),
      staff: Number.isFinite(Number(raw.staff)) ? Number(raw.staff) : null,
      sourceIndex: index
    }));
  });

  events.sort((a, b) => a.t - b.t || a.midi - b.midi || a.sourceIndex - b.sourceIndex);
  return events;
}

/** Group simultaneous notes into chords without merging adjacent grace-like notes. */
export function groupScoreChords(events, toleranceSeconds = 0.045) {
  const tolerance = clamp(Number(toleranceSeconds) || 0.045, 0.005, 0.15);
  const groups = [];
  for (const event of events || []) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(event.t - last.t) <= tolerance) {
      last.notes.push(event);
      last.end = Math.max(last.end, event.t + event.d);
    } else {
      groups.push({ id: `chord-${groups.length + 1}`, t: event.t, end: event.t + event.d, notes: [event] });
    }
  }
  return groups.map(group => Object.freeze({
    ...group,
    notes: Object.freeze(group.notes.slice()),
    midi: Object.freeze(group.notes.map(note => note.midi).sort((a, b) => a - b)),
    measures: Object.freeze([...new Set(group.notes.map(note => note.measure))])
  }));
}

/** Select only the requested hands and inclusive bar range. */
export function selectScoreEvents(events, { hand = 'both', fromBar = 1, toBar = Infinity } = {}) {
  const from = Math.max(1, Math.floor(Number(fromBar) || 1));
  const to = Math.max(from, Number.isFinite(Number(toBar)) ? Math.floor(Number(toBar)) : Infinity);
  return (events || []).filter(event =>
    event.measure >= from && event.measure <= to &&
    (hand === 'both' || event.hand === hand)
  );
}

/** Fit the visible keyboard to the music, with a two-octave minimum. */
export function calculateKeyboardRange(events, { min = MIN_MIDI, max = MAX_MIDI, paddingOctaves = 0 } = {}) {
  const valid = (events || []).map(event => Number(event.midi)).filter(n => Number.isInteger(n) && n >= min && n <= max);
  if (!valid.length) return { low: 48, high: 72, whiteKeys: 14 };
  const padding = Math.max(0, Math.min(2, Math.floor(paddingOctaves))) * 12;
  let low = Math.max(min, Math.floor((Math.min(...valid) - padding) / 12) * 12);
  let high = Math.min(max + 1, Math.ceil((Math.max(...valid) + 1 + padding) / 12) * 12);
  if (high - low < 24) {
    const missing = 24 - (high - low);
    low = Math.max(min, low - Math.ceil(missing / 24) * 12);
    high = Math.min(max + 1, Math.max(high, low + 24));
    if (high - low < 24) low = Math.max(min, high - 24);
  }
  let whiteKeys = 0;
  for (let midi = low; midi < high; midi += 1) if (!isBlackKey(midi)) whiteKeys += 1;
  return { low, high, whiteKeys };
}

/** Timing feedback is based on absolute onset error in seconds. */
export function gradeTiming(errorSeconds, { perfect = 0.09, good = 0.19, acceptable = 0.32 } = {}) {
  const error = Number(errorSeconds);
  if (!Number.isFinite(error)) return { grade: 'miss', errorMs: null };
  const absolute = Math.abs(error);
  const grade = absolute <= perfect ? 'perfect'
    : absolute <= good ? 'good'
    : absolute <= acceptable ? 'close' : 'miss';
  return { grade, errorMs: Math.round(error * 1000), direction: error < 0 ? 'early' : error > 0 ? 'late' : 'on-time' };
}

/** Weighted score never rewards an unanswered or missed note. */
export function calculatePracticeScore(events) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return { score: 0, attempted: 0, total: 0, accuracy: 0 };
  const weights = { perfect: 1, good: 0.8, close: 0.5 };
  let earned = 0;
  let attempted = 0;
  for (const event of list) {
    const grade = event?.grade ?? event?.res;
    if (Object.hasOwn(weights, grade)) { earned += weights[grade]; attempted += 1; }
  }
  return {
    score: Math.round(100 * earned / list.length),
    attempted,
    total: list.length,
    accuracy: Math.round(100 * attempted / list.length)
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Build bar intervals from the actual score timeline.
 * Measure starts are explicit score metadata, not inferred from whichever note
 * happened to be played most recently. Empty bars must be supplied by parser.
 */
export function buildMeasureTimeline(measures) {
  if (!Array.isArray(measures)) return [];
  const cleaned = measures.map((measure, index) => {
    const number = Math.max(1, Math.floor(Number(measure?.number) || index + 1));
    const start = Number(measure?.start ?? measure?.startTime);
    const end = Number(measure?.end ?? measure?.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
    return { number, start, end };
  }).filter(Boolean).sort((a, b) => a.start - b.start || a.number - b.number);
  for (let i = 1; i < cleaned.length; i += 1) {
    if (cleaned[i].start < cleaned[i - 1].start) return [];
  }
  return cleaned.map((measure, index) => Object.freeze({
    ...measure,
    index,
    duration: measure.end - measure.start
  }));
}

/** Find the bar containing the transport position, including rests and empty bars. */
export function findActiveMeasure(measures, positionSeconds) {
  const timeline = Array.isArray(measures) ? measures : [];
  const position = Number(positionSeconds);
  if (!Number.isFinite(position) || position < 0 || !timeline.length) return null;
  let low = 0;
  let high = timeline.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const measure = timeline[mid];
    if (position < measure.start) high = mid - 1;
    else if (position >= measure.end) low = mid + 1;
    else return measure.number;
  }
  if (low >= timeline.length) return timeline[timeline.length - 1].number;
  return high >= 0 ? timeline[high].number : timeline[0].number;
}

/** Stable note-on matching: repeated MIDI note-ons are tracked independently. */
export function createHeldNoteTracker() {
  const held = new Map();
  return {
    noteOn(midi, timestamp = performance.now()) {
      const key = Number(midi);
      if (!Number.isInteger(key) || key < 0 || key > 127) return null;
      const stack = held.get(key) || [];
      const token = Object.freeze({ midi: key, timestamp: Number(timestamp), sequence: stack.length ? stack[stack.length - 1].sequence + 1 : 1 });
      stack.push(token);
      held.set(key, stack);
      return token;
    },
    noteOff(midi) {
      const key = Number(midi);
      const stack = held.get(key);
      if (!stack?.length) return null;
      const token = stack.shift();
      if (!stack.length) held.delete(key);
      return token;
    },
    releaseAll() {
      const released = [...held.values()].flat();
      held.clear();
      return released;
    },
    isHeld(midi) { return Boolean(held.get(Number(midi))?.length); },
    get size() { return [...held.values()].reduce((total, stack) => total + stack.length, 0); }
  };
}
