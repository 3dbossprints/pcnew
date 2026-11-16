import test from "node:test";
import assert from "node:assert/strict";
import { parseMusicCoachFile } from "../src/musiccoach-format.js";

test("parses a valid MusicCoach analysis document", () => {
  const parsed = parseMusicCoachFile({
    format: "musiccoach",
    version: 1,
    tempo: 96,
    notes: [
      { midi: 60, note: "C4", time: 0, duration: 0.5, hand: "right", measure: 1 },
      { midi: 48, note: "C3", time: 0.5, duration: 1, hand: "left", measure: 1 },
    ],
  });
  assert.equal(parsed.notes.length, 2);
  assert.equal(parsed.notes[0].midi, 60);
  assert.equal(parsed.notes[1].hand, "left");
});

test("rejects unsupported MusicCoach versions", () => {
  assert.throws(() => parseMusicCoachFile({ format: "musiccoach", version: 99, notes: [] }), /unsupported format version/i);
});

test("rejects empty and invalid note timelines", () => {
  assert.throws(() => parseMusicCoachFile({ format: "musiccoach", version: 1, notes: [] }), /no recognised notes/i);
  assert.throws(() => parseMusicCoachFile({
    format: "musiccoach", version: 1,
    notes: [{ midi: 200, time: 0, duration: 1 }],
  }), /invalid note/i);
});
