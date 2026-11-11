import test from 'node:test';
import assert from 'node:assert/strict';
import {
  midiToName, nameToMidi, isBlackKey, normaliseScoreEvents,
  groupScoreChords, selectScoreEvents, calculateKeyboardRange,
  gradeTiming, calculatePracticeScore
} from '../src/score-engine.js';

test('note names round-trip across piano range', () => {
  for (let midi = 21; midi <= 108; midi += 1) assert.equal(nameToMidi(midiToName(midi)), midi);
  assert.equal(nameToMidi('H4'), null);
  assert.equal(midiToName(128), null);
});

test('normalisation rejects invalid events and sorts stable events', () => {
  const events = normaliseScoreEvents([
    { midi: 64, time: 1, duration: 0.5, measure: 2 },
    { midi: 60, time: 0, duration: 1, measure: 1 },
    { midi: 200, time: 0.2, duration: 1 },
    { midi: 65, time: -1, duration: 1 },
    { midi: 67, time: 2, duration: 0, id: 'dup' },
    { midi: 67, time: 3, duration: 1, id: 'dup' }
  ]);
  assert.deepEqual(events.map(e => e.midi), [60, 64, 67]);
  assert.equal(events[2].d, 0.6);
});

test('chord grouping respects tolerance and retains all notes', () => {
  const events = normaliseScoreEvents([
    { midi: 60, time: 0, duration: 1 },
    { midi: 64, time: 0.02, duration: 0.5 },
    { midi: 67, time: 0.2, duration: 0.5 }
  ]);
  const chords = groupScoreChords(events);
  assert.equal(chords.length, 2);
  assert.deepEqual(chords[0].midi, [60, 64]);
});

test('hand and bar selection is inclusive', () => {
  const events = normaliseScoreEvents([
    { midi: 60, time: 0, measure: 1, hand: 'left' },
    { midi: 64, time: 1, measure: 2, hand: 'right' },
    { midi: 67, time: 2, measure: 3, hand: 'right' }
  ]);
  assert.deepEqual(selectScoreEvents(events, { hand: 'right', fromBar: 2, toBar: 2 }).map(e => e.midi), [64]);
});

test('keyboard range covers all notes and at least two octaves', () => {
  const range = calculateKeyboardRange([{ midi: 61 }, { midi: 64 }]);
  assert.ok(range.high - range.low >= 24);
  assert.ok(range.low <= 61 && range.high > 64);
  assert.equal(isBlackKey(61), true);
  assert.equal(isBlackKey(60), false);
});

test('timing grading distinguishes early and late notes', () => {
  assert.equal(gradeTiming(-0.04).grade, 'perfect');
  assert.equal(gradeTiming(0.15).grade, 'good');
  assert.equal(gradeTiming(0.25).grade, 'close');
  assert.equal(gradeTiming(0.6).grade, 'miss');
  assert.equal(gradeTiming(-0.15).direction, 'early');
});

test('practice score counts missed notes in the denominator', () => {
  assert.deepEqual(calculatePracticeScore([
    { grade: 'perfect' }, { grade: 'good' }, { grade: 'miss' }, {}
  ]), { score: 45, attempted: 2, total: 4, accuracy: 50 });
  assert.deepEqual(calculatePracticeScore([]), { score: 0, attempted: 0, total: 0, accuracy: 0 });
});
