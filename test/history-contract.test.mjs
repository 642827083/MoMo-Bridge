import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const historySource = await readFile(new URL("../src/MomoImportHistory.js", import.meta.url), "utf8");
const bridgeSource = await readFile(new URL("../src/WebBridgeCommands.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test("Import history is stored as an atomic JSON file in the addon document directory", () => {
  assert.match(historySource, /Application\.sharedInstance\(\)\.documentPath/);
  assert.match(historySource, /DATA_DIRECTORY_NAME = "MoMoBridge"/);
  assert.match(historySource, /import-history\.json/);
  assert.match(historySource, /NSFileManager\.defaultManager\(\)/);
  assert.match(historySource, /NSJSONSerialization\.dataWithJSONObjectOptions\(safeDocument, 0\)/);
  assert.match(historySource, /NSJSONSerialization\.JSONObjectWithDataOptions\(data, 0\)/);
  assert.match(historySource, /function arrayItems\(list\)/);
  assert.match(historySource, /valueForKey\(parsed, "entries"\)/);
  assert.match(historySource, /writeToFileAtomically\(historyFilePath\(\), true\)/);
  assert.match(historySource, /MAX_HISTORY_ENTRIES = 10/);
});

test("Import history never stores or accepts a Token field", () => {
  assert.doesNotMatch(historySource, /token/i);
  assert.doesNotMatch(historySource, /savedToken/);
  assert.match(historySource, /function safeOptions\(payload\)/);
  assert.match(historySource, /function safeExample\(value, includeReason\)/);
});

test("Import history keeps failed words and examples and builds a retry-only plan", () => {
  assert.match(historySource, /failedWords = stringList\(wordResult\.failed\)/);
  assert.match(historySource, /failedExamples = safeExamples\(exampleResult\.failed, false\)/);
  assert.match(historySource, /wordbookWords: failedWords/);
  assert.match(historySource, /examples: failedExamples/);
  assert.match(historySource, /studyWords: retryStudy/);
  assert.match(historySource, /entry\.input && entry\.input\.studyWords/);
  assert.match(historySource, /kind: metadata && metadata\.kind === "retry"/);
});

test("Bridge records imports and exposes history listing and retry commands", () => {
  assert.match(mainSource, /JSB\.require\("MomoImportHistory"\)/);
  assert.match(bridgeSource, /recordImport\(payload, result/);
  assert.match(bridgeSource, /function listImportHistory\(\)/);
  assert.match(bridgeSource, /function retryImportHistory\(context, payload\)/);
  assert.match(bridgeSource, /retryPlan\(entry\)/);
  assert.match(bridgeSource, /listImportHistory,/);
  assert.match(bridgeSource, /retryImportHistory,/);
});

test("A top-level API rejection is converted to retryable history without hiding the original error", () => {
  assert.match(bridgeSource, /const failedResult = \{/);
  assert.match(bridgeSource, /failed: options\.addWords \? apiOptions\.wordbookWords\.slice\(\) : \[\]/);
  assert.match(bridgeSource, /failed: options\.addExamples \? examples\.map/);
  assert.match(bridgeSource, /throw error/);
});
