import test from 'node:test';
import assert from 'node:assert/strict';
import { nameToMidi, buildMeasureTimeline, findActiveMeasure, createHeldNoteTracker } from '../src/score-engine.js';

test('note parser accepts natural, sharp, flat and negative octave notes', () => {
  assert.equal(nameToMidi('C4'), 60);
  assert.equal(nameToMidi('F#5'), 78);
  assert.equal(nameToMidi('Bb3'), 58);
  assert.equal(nameToMidi('C-1'), 0);
  assert.equal(nameToMidi('H4'), null);
});

test('measure cursor highlights rests and exact bar boundaries correctly', () => {
  const bars = buildMeasureTimeline([
    { number: 1, start: 0, end: 2 },
    { number: 2, start: 2, end: 4 },
    { number: 3, start: 4, end: 7 }
  ]);
  assert.equal(findActiveMeasure(bars, 0), 1);
  assert.equal(findActiveMeasure(bars, 1.99), 1);
  assert.equal(findActiveMeasure(bars, 2), 2);
  assert.equal(findActiveMeasure(bars, 3.99), 2);
  assert.equal(findActiveMeasure(bars, 4), 3);
  assert.equal(findActiveMeasure(bars, 9), 3);
  assert.equal(findActiveMeasure(bars, -1), null);
});

test('held note tracker handles repeated note-ons and releases safely', () => {
  const tracker = createHeldNoteTracker();
  tracker.noteOn(60, 10);
  tracker.noteOn(60, 20);
  assert.equal(tracker.size, 2);
  assert.equal(tracker.noteOff(60).timestamp, 10);
  assert.equal(tracker.isHeld(60), true);
  assert.equal(tracker.noteOff(60).timestamp, 20);
  assert.equal(tracker.noteOff(60), null);
  tracker.noteOn(64, 30);
  assert.equal(tracker.releaseAll().length, 1);
  assert.equal(tracker.size, 0);
});
