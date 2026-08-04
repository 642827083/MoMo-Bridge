import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/MomoApi.js", import.meta.url), "utf8");

test("MomoApi uses the request, JSON, and HTTP-status methods exported by MarginNote", () => {
  assert.match(source, /request\.setHTTPMethod\(method\)/);
  assert.match(source, /request\.setHTTPBody\(NSJSONSerialization\.dataWithJSONObjectOptions\(body, 0\)\)/);
  assert.match(source, /NSJSONSerialization\.dataWithJSONObjectOptions\(body, 0\)/);
  assert.match(source, /NSJSONSerialization\.JSONObjectWithDataOptions\(data, 1\)/);
  assert.match(source, /response\.statusCode\(\)/);
  assert.doesNotMatch(source, /request\.HTTPMethod\s*=/);
  assert.doesNotMatch(source, /request\.HTTPBody\s*=/);
  assert.doesNotMatch(source, /OptionsError/);
});

test("MomoApi uses the current memo notepad endpoint", () => {
  assert.match(source, /\/memo\/notepads/);
  assert.match(source, /requestJSON\(token, "\/memo\/notepads\?limit=10&offset=0", "GET"\)/);
});

test("MomoApi preserves the API's nested authorization error message", () => {
  assert.match(source, /valueForKey\(firstError, "msg"\)/);
  assert.match(source, /apiErrorMessage\(payload\)/);
});

test("MomoApi accepts a token pasted with an optional Bearer prefix", () => {
  assert.match(source, /replace\(\/\^Bearer\\s\+\/i, ""\)/);
  assert.match(source, /`Bearer \$\{apiToken\}`/);
});

test("MomoApi follows MarginNote's complete request configuration", () => {
  assert.match(source, /request\.setTimeoutInterval\(10\)/);
  assert.match(source, /request\.setAllHTTPHeaderFields\(headers\)/);
  assert.match(source, /"User-Agent": "Mozilla\/5\.0/);
});

test("MomoApi does not mistake MarginNote's NSNull success placeholder for an error", () => {
  assert.match(source, /value instanceof NSNull/);
  assert.match(source, /if \(!isNativeNil\(error\)\)/);
});

test("MomoApi reads native NSArray count methods", () => {
  assert.match(source, /typeof list\.count === "function"/);
  assert.match(source, /list\.count\(\)/);
});

test("MomoApi supports direct and data-wrapped notepad lists", () => {
  assert.match(source, /valueForKey\(payload, "notepads"\)/);
  assert.match(source, /valueForKey\(data, "notepads"\)/);
});

test("MomoApi accepts direct and data-wrapped notepad detail responses", () => {
  assert.match(source, /function extractNotepad\(payload\)/);
  assert.match(source, /valueForKey\(payload, "notepad"\)/);
  assert.match(source, /valueForKey\(data, "notepad"\)/);
  assert.match(source, /if \(looksLikeNotepad\(data\)\) return data/);
  assert.match(source, /if \(looksLikeNotepad\(payload\)\) return payload/);
});

test("MomoApi verifies imports with a fresh notepad read", () => {
  assert.match(source, /POST responses are often acknowledgements/);
  assert.match(source, /requestJSON\(token, path, "GET"\)/);
});

test("MomoApi can classify words from raw notepad content", () => {
  assert.match(source, /Some API responses omit the parsed list/);
  assert.match(source, /content\.split\(\/\\r\?\\n\//);
});
