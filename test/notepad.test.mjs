import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNotepadUpdate,
  classifyImportResult,
} from "../web/src/domain/notepad.mjs";

const existingNotepad = {
  id: "book-1",
  status: "PUBLISHED",
  content: "# 既有章节\nshrink\nmake",
  title: "我的单词书",
  brief: "来自 MarginNote",
  tags: ["英语"],
  list: [
    { type: "WORD", data: { word: "shrink" } },
    { type: "WORD", data: { word: "make" } },
  ],
};

test("buildNotepadUpdate appends only words absent from the selected cloud wordbook", () => {
  assert.deepEqual(
    buildNotepadUpdate(existingNotepad, ["shrink", "take", "make", "give"]),
    {
      request: {
        id: "book-1",
        notepad: {
          status: "PUBLISHED",
          content: "# 既有章节\nshrink\nmake\ntake\ngive",
          title: "我的单词书",
          brief: "来自 MarginNote",
          tags: ["英语"],
        },
      },
      candidates: ["take", "give"],
      duplicates: ["shrink", "make"],
    },
  );
});

test("classifyImportResult reports confirmed additions, existing duplicates, and rejected words", () => {
  const updatedNotepad = {
    ...existingNotepad,
    list: [
      ...existingNotepad.list,
      { type: "WORD", data: { word: "take" } },
    ],
  };

  assert.deepEqual(
    classifyImportResult(existingNotepad, updatedNotepad, ["shrink", "take", "give"]),
    {
      success: ["take"],
      duplicate: ["shrink"],
      failed: ["give"],
    },
  );
});
