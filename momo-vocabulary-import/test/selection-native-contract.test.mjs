import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/MomoSelection.js", import.meta.url), "utf8");

test("MomoSelection reads native NSArray count methods", () => {
  assert.match(source, /typeof list\.count === "function"/);
  assert.match(source, /list\.count\(\)/);
});

test("MomoSelection normalizes native NSString note titles", () => {
  assert.match(source, /const title = String\(rawTitle\)\.trim\(\)/);
  assert.doesNotMatch(source, /typeof title === "string"/);
});

test("MomoSelection supports bridged property methods", () => {
  assert.match(source, /typeof value === "function"/);
  assert.match(source, /value\.call\(object\)/);
  assert.match(source, /nativeMember\(mindmapView, "selViewLst"\)/);
});

test("MomoSelection exposes selection diagnostics", () => {
  assert.match(source, /selectionDebug/);
  assert.match(source, /selectedViewCount: selectedViews\.length/);
});
