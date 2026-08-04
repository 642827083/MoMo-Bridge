import assert from "node:assert/strict";
import test from "node:test";

import { collectLemmas, extractLemma } from "../web/src/domain/lemma.mjs";

test("extractLemma returns the AutoComplete title's first word form", () => {
  assert.equal(
    extractLemma("shrink; shrank; shrunk; shrinking; shrinks"),
    "shrink",
  );
});

test("extractLemma trims whitespace and supports Chinese semicolons", () => {
  assert.equal(extractLemma("  Competitor； competitors  "), "competitor");
});

test("extractLemma skips titles whose first segment is not an English word", () => {
  assert.equal(extractLemma("3rd-place; third-place"), null);
});

test("extractLemma accepts punctuation around a word", () => {
  assert.equal(extractLemma("[order]; ordered; ordering"), "order");
});

test("collectLemmas preserves order and removes case-insensitive duplicates", () => {
  assert.deepEqual(
    collectLemmas([
      "Infer; inferred; inferring; infers",
      "infer; inferred",
      "maker; makers",
      "not a word 123; ignored",
    ]),
    {
      lemmas: ["infer", "maker"],
      skippedTitles: ["not a word 123; ignored"],
    },
  );
});
