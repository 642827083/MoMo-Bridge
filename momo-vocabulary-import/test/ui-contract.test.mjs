import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../web/src/App.jsx", import.meta.url), "utf8");

test("Token help link appears above the Token input", () => {
  const labelIndex = source.indexOf('htmlFor="momo-token"');
  const linkIndex = source.indexOf('href="https://accounts.maimemo.com/interaction/gPKHilg7fXNmsi2OrZK8IbH4AV6l7bZKRZTU4Aowmii"');
  const inputIndex = source.indexOf('id="momo-token"');

  assert.ok(labelIndex >= 0, "Token label should exist");
  assert.ok(linkIndex > labelIndex, "Token help link should follow the label");
  assert.ok(inputIndex > linkIndex, "Token input should follow the help link");
  assert.match(source, /如何获取墨墨 Token/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
});
