import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/MomoApi.js", import.meta.url), "utf8");
const bridgeSource = await readFile(new URL("../src/WebBridgeCommands.js", import.meta.url), "utf8");
const selectionSource = await readFile(new URL("../src/MomoSelection.js", import.meta.url), "utf8");
const buildSource = await readFile(new URL("../scripts/build-release.js", import.meta.url), "utf8");
const packageSource = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

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

test("MomoApi explains rate-limit responses and keeps each example batch within ten", () => {
  assert.match(source, /MAX_EXAMPLES_PER_IMPORT = 10/);
  assert.match(source, /too many request\|rate limit/);
  assert.match(source, /请求过于频繁，请等待约 1 分钟后再试/);
  assert.match(source, /candidates\.length > MAX_EXAMPLES_PER_IMPORT/);
  assert.match(source, /function importExampleQueue\(token, words, examples, options\)/);
  assert.match(source, /Math\.ceil\(candidates\.length \/ MAX_EXAMPLES_PER_IMPORT\)/);
  assert.match(source, /candidates\.slice\(/);
});

test("MomoApi accepts a token pasted with an optional Bearer prefix", () => {
  assert.match(source, /replace\(\/\^Bearer\\s\+\/i, ""\)/);
  assert.match(source, /`Bearer \$\{apiToken\}`/);
});

test("MomoApi follows MarginNote's complete request configuration", () => {
  assert.match(source, /request\.setTimeoutInterval\(10\)/);
  assert.match(source, /request\.setAllHTTPHeaderFields\(headers\)/);
  assert.match(source, /"User-Agent": "Mozilla\/5\.0/);
  assert.match(source, /function uncachedPath\(path\)/);
  assert.match(source, /method === "GET" \? uncachedPath\(path\) : path/);
  assert.match(source, /"Cache-Control": "no-cache, no-store"/);
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
  assert.match(source, /POST 响应通常只是确认/);
  assert.match(source, /requestJSON\(token, path, "GET"\)/);
});

test("MomoApi can classify words from raw notepad content", () => {
  assert.match(source, /有些接口响应会晚于原始内容/);
  assert.match(source, /保留原始内容备用解析/);
  assert.match(source, /function rawContentWords\(content\)/);
  assert.match(source, /function deduplicateTargetLines\(content, words\)/);
  assert.match(source, /content\.split\(\/\\r\?\\n\//);
});

test("MomoApi chooses the best response after a batch update", () => {
  assert.match(source, /function notepadCompleteness\(notepad, words\)/);
  assert.match(source, /function preferNotepad\(first, second, words\)/);
  assert.match(source, /const posted = extractNotepad\(postPayload\)/);
  assert.match(source, /postedCheck\.present === postedCheck\.total/);
  assert.match(source, /preferNotepad\(posted, after, update\.candidates\)/);
  assert.match(source, /function appendMissingWords\(token, path, notepad, words\)/);
  assert.match(source, /function readNotepadUntilWords\(token, path, notepad, words\)/);
  assert.match(source, /const maxAttempts = 6/);
  assert.match(source, /setTimeout\(resolve, milliseconds\)/);
  assert.match(source, /NSTimer\.scheduledTimerWithTimeInterval/);
  assert.match(source, /const missingWords = wanted\.filter/);
  assert.match(source, /contentChanged: nextContent !== content/);
});

test("MomoApi keeps word verification to one fresh read", () => {
  assert.match(source, /return finish\(before, initial\)/);
  assert.doesNotMatch(source, /readNotepadUntilWords\(token, path, initial, update\.candidates\)/);
});

test("MomoApi resolves vocabulary IDs and creates translated phrases", () => {
  assert.match(source, /requestJSONWithFallback\(token, \["\/vocabulary\/query", "\/memo\/vocabulary\/query"\], "POST"/);
  assert.match(source, /接口将拼写和 ID 视为互斥参数/);
  assert.match(source, /spellings,\n\s+\}\)/);
  assert.match(source, /\[`\/phrases\$\{query\}`, `\/memo\/phrases\$\{query\}`\]/);
  assert.match(source, /requestJSONWithFallback\(token, \["\/phrases", "\/memo\/phrases"\], "POST"/);
  assert.match(source, /function vocabularyTargets\(vocabularyIds, example\)/);
  assert.match(source, /const spellings = \[example\.lemma, example\.word\]/);
  assert.match(source, /for \(const vocabularyId of targets\.ids\)/);
  assert.match(source, /voc_id: vocabularyId/);
  assert.match(source, /interpretation: example\.interpretation/);
  assert.match(source, /origin: example\.origin/);
  assert.match(source, /墨墨接口已响应，但重新读取时未找到这条例句/);
  assert.match(source, /tags: \["考研"\]/);
});

test("MomoSelection returns card text for sentence extraction", () => {
  assert.match(bridgeSource, /getSelectedCards/);
  assert.match(selectionSource, /excerptText/);
  assert.match(selectionSource, /comments/);
});

test("Web bridge opens the token help page outside the plugin web view", () => {
  assert.match(bridgeSource, /function openExternalURL\(context, payload\)/);
  assert.match(bridgeSource, /https:\/\/open\.maimemo\.com\//);
  assert.match(bridgeSource, /UIApplication\.sharedApplication\(\)\.openURL\(url\)/);
  assert.match(bridgeSource, /openExternalURL,/);
});

test("Web bridge tests a supplied Token without saving it", () => {
  assert.match(bridgeSource, /function testMomoConnection\(context, payload\)/);
  assert.match(bridgeSource, /payload\.token/);
  assert.match(bridgeSource, /listNotepads\(token\)/);
  assert.match(bridgeSource, /tokenValid/);
  assert.match(bridgeSource, /canReadNotepads/);
  assert.match(bridgeSource, /testMomoConnection,/);
});

test("Web bridge supports independent word and example selections and legacy modes", () => {
  assert.match(bridgeSource, /payload\.mode/);
  assert.match(bridgeSource, /typeof payload\.addWords === "boolean"/);
  assert.match(bridgeSource, /typeof payload\.addExamples === "boolean"/);
  assert.match(bridgeSource, /typeof payload\.addStudy === "boolean"/);
  assert.match(bridgeSource, /advanceStudy: addStudy && payload\.advanceStudy === true/);
  assert.match(bridgeSource, /payload\.addWords === true : mode !== "examples"/);
  assert.match(bridgeSource, /payload\.addExamples === true : mode !== "words"/);
  assert.match(bridgeSource, /!options\.addWords && !options\.addExamples && !options\.addStudy/);
  assert.match(bridgeSource, /addWords: options\.addWords/);
  assert.match(bridgeSource, /addExamples: options\.addExamples/);
  assert.match(bridgeSource, /addStudy: options\.addStudy/);
  assert.match(bridgeSource, /advanceStudy: options\.advanceStudy/);
});

test("MomoApi adds words first and uses the dedicated endpoint for optional advance review", () => {
  assert.match(source, /function importStudyWords\(token, words, advanceStudy\)/);
  assert.match(source, /requestJSON\(token, "\/memo\/study\/add_words", "POST"/);
  assert.match(source, /words: vocabularyWords/);
  assert.match(source, /advance: false/);
  assert.match(source, /requestJSON\(token, "\/memo\/study\/advance_study", "POST"/);
  assert.match(source, /voc_ids: vocabularyWords\.map/);
  assert.match(source, /valueForKey\(payload, "added_count"\)/);
  assert.match(source, /valueForKey\(advancePayload, "advanced_count"\)/);
  assert.match(source, /notAddedCount/);
  assert.match(source, /notAdvancedCount/);
  assert.match(source, /missing/);
  assert.match(source, /advanceRequested: advanceStudy === true/);
  assert.match(source, /advanceError/);
  assert.match(source, /function advanceStudyErrorMessage\(error\)/);
  assert.match(source, /permission denied\|forbidden\|权限不足/);
  assert.match(source, /墨墨提前复习要求账号达到 10 级/);
  assert.match(source, /const requestPacer = createRequestPacer\(700\)/);
});

test("Web bridge accepts large example selections and reports queue progress", () => {
  assert.doesNotMatch(bridgeSource, /addExamples && examples\.length > MAX_EXAMPLES_PER_IMPORT/);
  assert.match(bridgeSource, /onProgress: function \(progress\)/);
  assert.match(bridgeSource, /context\.reportProgress\(progress\)/);
  assert.match(source, /function createRequestPacer\(interval\)/);
  assert.match(source, /function createResilientRequester\(onRetry\)/);
  assert.match(source, /RATE_LIMIT_RETRY_MS = 60000/);
  assert.match(source, /TRANSIENT_RETRY_DELAYS_MS = \[2000, 5000, 10000\]/);
  assert.match(source, /phase: "waiting"/);
  assert.match(source, /estimatedRemainingSeconds/);
  assert.match(source, /onEstimate/);
});

test("Development builds use a stable test name and protect formal packages", () => {
  assert.equal(packageSource.scripts.build, "node scripts/build-release.js --test");
  assert.equal(packageSource.scripts["build:release"], "node scripts/build-release.js --release");
  assert.match(buildSource, /`\$\{addonName\} Test\.mnaddon`/);
  assert.match(buildSource, /正式安装包已存在，为避免覆盖已发布文件已停止构建/);
  assert.match(buildSource, /!releaseBuild && fs\.existsSync\(outputPath\)/);
  assert.match(buildSource, /function clearDevServerConfig\(rootDir\)/);
  assert.match(buildSource, /clearDevServerConfig\(rootDir\);\s*buildWebAssets\(rootDir\);/);
});
