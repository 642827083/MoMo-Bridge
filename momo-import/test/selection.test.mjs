import assert from "node:assert/strict";
import test from "node:test";

import { selectedTitlesFromNodes } from "../web/src/domain/selection.mjs";

test("selectedTitlesFromNodes reads titles from MarginNote selected node views", () => {
  assert.deepEqual(
    selectedTitlesFromNodes([
      { note: { noteTitle: "shrink; shrank; shrunk" } },
      { note: { noteTitle: "make; made; making" } },
      { note: { noteTitle: "" } },
      null,
    ]),
    ["shrink; shrank; shrunk", "make; made; making"],
  );
});

test("selectedTitlesFromNodes returns an empty list when nothing is selected", () => {
  assert.deepEqual(selectedTitlesFromNodes(undefined), []);
});
