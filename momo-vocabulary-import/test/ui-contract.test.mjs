import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../web/src/App.jsx", import.meta.url), "utf8");

test("Token help link appears above the Token input", () => {
  const labelIndex = source.indexOf('htmlFor="momo-token"');
  const linkIndex = source.indexOf('href="https://open.maimemo.com/#/"');
  const inputIndex = source.indexOf('id="momo-token"');

  assert.ok(labelIndex >= 0, "Token label should exist");
  assert.ok(linkIndex > labelIndex, "Token help link should follow the label");
  assert.ok(inputIndex > linkIndex, "Token input should follow the help link");
  assert.match(source, /如何获取墨墨 Token/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
});

test("Selection errors distinguish an empty MarginNote selection", () => {
  assert.match(source, /selectedViewCount/);
  assert.match(source, /MarginNote 未返回已选卡片/);
});

test("Selection errors include title samples", () => {
  assert.match(source, /标题样例/);
  assert.match(source, /titleSamples/);
});
