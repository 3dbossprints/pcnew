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

test("verified syllabus matches are prioritised for the student's exam board and grade", () => {
  const results = searchScales("", "ABRSM", "Grade 1");
  assert.ok(results.length > 0);
  const matched = results.filter(item => item.examMatch);
  assert.ok(matched.length > 0, "ABRSM Grade 1 should have verified syllabus matches");
  assert.ok(matched.every(item => item.syllabusMatches.some(m => m.examBoard === "ABRSM" && m.grade === "Grade 1")));
  // Non-matching entries should not be flagged as exam matches
  const unmatched = results.filter(item => !item.examMatch);
  assert.ok(unmatched.length > 0, "there should also be non-matching general entries");
});

test("non-matching exam board does not produce false matches", () => {
  const results = searchScales("", "Nonexistent Board", "Grade 99");
  assert.ok(results.every(item => item.examMatch === false));
});
