import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../web/src/App.jsx", import.meta.url), "utf8");

test("Token input appears without an external help link", () => {
  const labelIndex = source.indexOf('htmlFor="momo-token"');
  const inputIndex = source.indexOf('id="momo-token"');

  assert.ok(labelIndex >= 0, "Token label should exist");
  assert.ok(inputIndex > labelIndex, "Token input should follow the label");
  assert.doesNotMatch(source, /accounts\.maimemo\.com/);
  assert.doesNotMatch(source, /如何获取墨墨 Token/);
});

test("Selection errors distinguish an empty MarginNote selection", () => {
  assert.match(source, /selectedViewCount/);
  assert.match(source, /MarginNote 未返回已选卡片/);
});

test("Selection errors include title samples", () => {
  assert.match(source, /标题样例/);
  assert.match(source, /titleSamples/);
});
