import test from "node:test";
import assert from "node:assert/strict";
import { SCALE_LIBRARY, searchScales } from "./scale-library.js";

test("flat-key minor searches match titles with intervening scale labels", () => {
  const results = searchScales("C♭ minor");
  assert.ok(results.some(item => item.title === "C♭ Natural minor"));
  assert.ok(results.some(item => item.title === "C♭ Harmonic minor"));
});

test("contrary-motion searches match the full key and motion", () => {
  const results = searchScales("E minor contrary motion");
  assert.ok(results.some(item => item.title === "E minor · contrary motion"));
});

test("minor interval scales and broken chords use minor-key roots", () => {
  assert.ok(SCALE_LIBRARY.some(item => item.title === "A Minor scale in thirds"));
  assert.ok(SCALE_LIBRARY.some(item => item.title === "E Minor scale in sixths"));
  assert.ok(SCALE_LIBRARY.some(item => item.title === "E Minor broken chord"));
  assert.ok(!SCALE_LIBRARY.some(item => item.title === "D♭ Minor scale in thirds"));
  assert.ok(!SCALE_LIBRARY.some(item => item.title === "D♭ Minor broken chord"));
});

test("scale catalogue identifiers are unique", () => {
  const ids = SCALE_LIBRARY.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("unverified catalogue entries are not presented as exam-board matches", () => {
  const results = searchScales("", "ABRSM", "Grade 1");
  assert.ok(results.length > 0);
  assert.ok(results.every(item => item.examMatch === false));
});
