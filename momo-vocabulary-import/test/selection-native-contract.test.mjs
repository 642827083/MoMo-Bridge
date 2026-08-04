import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/MomoSelection.js", import.meta.url), "utf8");

test("MomoSelection reads native NSArray count methods", () => {
  assert.match(source, /typeof list\.count === "function"/);
  assert.match(source, /list\.count\(\)/);
});
