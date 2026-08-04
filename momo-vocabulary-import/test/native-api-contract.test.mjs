import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/MomoApi.js", import.meta.url), "utf8");

test("MomoApi uses the request, JSON, and HTTP-status methods exported by MarginNote", () => {
  assert.match(source, /request\.setHTTPMethod\(method\)/);
  assert.match(source, /request\.setHTTPBody\(NSJSONSerialization\.dataWithJSONObjectOptions\(body, 0\)\)/);
  assert.match(source, /NSJSONSerialization\.dataWithJSONObjectOptions\(body, 0\)/);
  assert.match(source, /NSJSONSerialization\.JSONObjectWithDataOptions\(data, 0\)/);
  assert.match(source, /response\.statusCode\(\)/);
  assert.doesNotMatch(source, /request\.HTTPMethod\s*=/);
  assert.doesNotMatch(source, /request\.HTTPBody\s*=/);
  assert.doesNotMatch(source, /OptionsError/);
});

test("MomoApi uses the current memo notepad endpoint", () => {
  assert.match(source, /\/memo\/notepads/);
  assert.doesNotMatch(source, /"\/notepads\?limit=100/);
});
