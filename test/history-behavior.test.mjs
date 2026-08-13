import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/MomoImportHistory.js", import.meta.url), "utf8");

function createHistoryRuntime() {
  const files = new Map();
  const directories = new Set(["/documents"]);
  const fileManager = {
    fileExistsAtPath(path) {
      return files.has(path) || directories.has(path);
    },
    createDirectoryAtPathWithIntermediateDirectoriesAttributes(path) {
      directories.add(path);
      return true;
    },
  };
  const context = {
    Application: {
      sharedInstance() {
        return { documentPath: "/documents" };
      },
    },
    NSFileManager: {
      defaultManager() {
        return fileManager;
      },
    },
    NSData: {
      dataWithContentsOfFile(path) {
        const text = files.get(path);
        if (typeof text !== "string") return null;
        return { text, length() { return text.length; } };
      },
    },
    NSJSONSerialization: {
      JSONObjectWithDataOptions(data) {
        return JSON.parse(data.text);
      },
      dataWithJSONObjectOptions(value) {
        const text = JSON.stringify(value);
        return {
          text,
          writeToFileAtomically(path) {
            files.set(path, text);
            return true;
          },
        };
      },
    },
    Date,
    JSON,
    Math,
  };
  vm.runInNewContext(source, context);
  return { history: context.__MN_MOMO_IMPORT_HISTORY_GLOBAL__, files };
}

test("History survives a fresh read and omits the Token", () => {
  const { history, files } = createHistoryRuntime();
  history.recordImport({
    token: "must-not-be-saved",
    words: ["alpha", "beta"],
    examples: [],
    addWords: true,
    addExamples: false,
    addStudy: false,
  }, {
    success: ["alpha"],
    duplicate: [],
    failed: ["beta"],
  }, { bookId: "book-1" });

  const entries = history.listHistory();
  assert.equal(entries.length, 1);
  assert.deepEqual(Array.from(entries[0].result.words.failed), ["beta"]);
  const persisted = [...files.values()][0];
  assert.equal(persisted.includes("must-not-be-saved"), false);
  assert.equal(persisted.toLowerCase().includes("token"), false);
});

test("Retry plan includes only failed wordbook words and failed examples", () => {
  const { history } = createHistoryRuntime();
  const entry = history.recordImport({
    words: ["alpha", "beta"],
    examples: [
      { word: "alpha", lemma: "alpha", phrase: "Alpha works.", interpretation: "Alpha 有效。" },
      { word: "beta", lemma: "beta", phrase: "Beta works.", interpretation: "Beta 有效。" },
    ],
    addWords: true,
    addExamples: true,
    addStudy: false,
  }, {
    success: ["alpha"],
    duplicate: [],
    failed: ["beta"],
    examples: {
      success: [{ word: "alpha", lemma: "alpha", phrase: "Alpha works.", interpretation: "Alpha 有效。" }],
      duplicate: [],
      failed: [{
        word: "beta",
        lemma: "beta",
        phrase: "Beta works.",
        interpretation: "Beta 有效。",
        reason: "临时失败",
      }],
    },
  }, { bookId: "book-1" });

  const retry = history.retryPlan(entry);
  assert.deepEqual(Array.from(retry.wordbookWords), ["beta"]);
  assert.deepEqual(Array.from(retry.examples, (example) => example.word), ["beta"]);
  assert.equal(retry.words.includes("alpha"), false);
  assert.equal(retry.addWords, true);
  assert.equal(retry.addExamples, true);
});

test("Study retry explains the API boundary by resubmitting the original related words", () => {
  const { history } = createHistoryRuntime();
  const entry = history.recordImport({
    words: ["alpha", "beta"],
    examples: [],
    addWords: false,
    addExamples: false,
    addStudy: true,
    advanceStudy: true,
  }, {
    study: {
      requestedCount: 2,
      resolvedCount: 2,
      addedCount: 1,
      notAddedCount: 1,
      missing: [],
      advanceRequested: true,
      advancedCount: 1,
      notAdvancedCount: 1,
    },
  }, { bookId: "" });

  const retry = history.retryPlan(entry);
  assert.equal(retry.addStudy, true);
  assert.equal(retry.advanceStudy, true);
  assert.deepEqual(Array.from(retry.studyWords), ["alpha", "beta"]);
});

test("History restores dictionary and array containers returned by MarginNote", () => {
  const { history, files } = createHistoryRuntime();
  const nativeArray = (items) => ({
    count() { return items.length; },
    objectAtIndex(index) { return items[index]; },
  });
  const nativeDictionary = (value) => ({
    objectForKey(key) { return value[key]; },
  });
  const stored = nativeDictionary({
    entries: nativeArray([
      nativeDictionary({
        id: "native-entry",
        createdAt: "2026-08-12T00:00:00.000Z",
        kind: "import",
        bookId: "book-native",
        options: nativeDictionary({ addWords: true, addExamples: false, addStudy: false }),
        input: nativeDictionary({ words: nativeArray(["alpha"]) }),
        result: nativeDictionary({
          words: nativeDictionary({
            success: nativeArray([]),
            duplicate: nativeArray([]),
            failed: nativeArray(["alpha"]),
          }),
          examples: nativeDictionary({}),
          study: nativeDictionary({}),
        }),
      }),
    ]),
  });
  files.set("/documents/MoMoImport/import-history.json", JSON.stringify({ entries: [] }));

  // 仅替换 JSON 解析器响应，以模拟桥接后的原生容器。
  const runtime = createHistoryRuntime();
  runtime.files.set("/documents/MoMoImport/import-history.json", JSON.stringify({ entries: [] }));
  // 使用原生容器测试夹具重新创建解析器替身。
  const context = {
    Application: { sharedInstance: () => ({ documentPath: "/documents" }) },
    NSFileManager: { defaultManager: () => ({
      fileExistsAtPath: () => true,
      createDirectoryAtPathWithIntermediateDirectoriesAttributes: () => true,
    }) },
    NSData: { dataWithContentsOfFile: () => ({ length: () => 1 }) },
    NSJSONSerialization: {
      JSONObjectWithDataOptions: () => stored,
      dataWithJSONObjectOptions: () => ({ writeToFileAtomically: () => true }),
    },
    Date,
    JSON,
    Math,
  };
  vm.runInNewContext(source, context);
  const entries = context.__MN_MOMO_IMPORT_HISTORY_GLOBAL__.listHistory();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "native-entry");
  assert.deepEqual(Array.from(entries[0].result.words.failed), ["alpha"]);
  assert.equal(entries[0].retry.available, true);
});
