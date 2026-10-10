import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/MomoImportHistory.js", import.meta.url), "utf8");
const readingSource = await readFile(new URL("../src/MomoReadingHistory.js", import.meta.url), "utf8");
const bridgeSource = await readFile(new URL("../src/WebBridgeCommands.js", import.meta.url), "utf8");

function createHistoryRuntime(runtimeSource = source, files = new Map()) {
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
  vm.runInNewContext(runtimeSource, context);
  return {
    history: context.__MN_MOMO_IMPORT_HISTORY_GLOBAL__ || context.__MN_MOMO_READING_HISTORY_GLOBAL__,
    files,
    context,
  };
}

for (const kind of ["import", "reading"]) {
  test(`${kind} history stays cleared after reopening and supports new records`, () => {
    const runtimeSource = kind === "import" ? source : readingSource;
    const { history, files } = createHistoryRuntime(runtimeSource);
    const record = (target) => kind === "import"
      ? target.recordImport({ words: ["alpha"], addWords: true }, { success: ["alpha"] }, {})
      : target.recordArticle({ words: [{ id: 1, spelling: "alpha" }] }, { article: "Alpha works." });
    record(history);
    history.clearHistory();
    assert.equal(history.listHistory().length, 0);
    assert.deepEqual(JSON.parse([...files.values()][0]).entries, []);
    const reopened = createHistoryRuntime(runtimeSource, files).history;
    assert.equal(reopened.listHistory().length, 0);
    const next = record(reopened);
    assert.deepEqual(Array.from(reopened.listHistory(), (entry) => entry.id), [next.id]);
  });

  test(`${kind} history is preserved if clearing cannot be saved`, () => {
    const runtimeSource = kind === "import" ? source : readingSource;
    const { history, files } = createHistoryRuntime(runtimeSource);
    const entry = kind === "import"
      ? history.recordImport({ words: ["alpha"], addWords: true }, { success: ["alpha"] }, {})
      : history.recordArticle({ words: [{ id: 1, spelling: "alpha" }] }, { article: "Alpha works." });
    const before = [...files.values()][0];
    files.set = () => { throw new Error("storage unavailable"); };
    assert.throws(() => history.clearHistory(), /storage unavailable/);
    assert.equal([...files.values()][0], before);
    assert.deepEqual(Array.from(createHistoryRuntime(runtimeSource, files).history.listHistory(), (item) => item.id), [entry.id]);
  });

  test(`${kind} history retains the latest ten entries across saving and reopening`, () => {
    const runtimeSource = kind === "import" ? source : readingSource;
    const { history, files } = createHistoryRuntime(runtimeSource);
    const savedIds = [];
    for (let index = 1; index <= 13; index += 1) {
      const entry = kind === "import"
        ? history.recordImport({ words: [`word-${index}`], addWords: true }, { success: [`word-${index}`] }, {})
        : history.recordArticle({ words: [{ id: index, spelling: `word-${index}` }] }, { article: `Article ${index}` });
      savedIds.unshift(entry.id);
    }
    const expected = savedIds.slice(0, 10);
    assert.deepEqual(Array.from(history.listHistory(), (entry) => entry.id), expected);
    const stored = JSON.parse([...files.values()][0]);
    assert.deepEqual(stored.entries.map((entry) => entry.id), expected);
    const reopened = createHistoryRuntime(runtimeSource, files);
    assert.deepEqual(Array.from(reopened.history.listHistory(), (entry) => entry.id), expected);
  });

  test(`${kind} history reads older larger files as the latest ten entries`, () => {
    const runtimeSource = kind === "import" ? source : readingSource;
    const { history, files } = createHistoryRuntime(runtimeSource);
    const entry = kind === "import"
      ? history.recordImport({ words: ["alpha"], addWords: true }, { success: ["alpha"] }, {})
      : history.recordArticle({ words: [{ id: 1, spelling: "alpha" }] }, { article: "Alpha works." });
    const [path, text] = [...files.entries()][0];
    const stored = JSON.parse(text);
    stored.entries = Array.from({ length: 12 }, (_, index) => ({ ...entry, id: `old-${index}` }));
    files.set(path, JSON.stringify(stored));
    const reopened = createHistoryRuntime(runtimeSource, files);
    assert.deepEqual(Array.from(reopened.history.listHistory(), (item) => item.id), Array.from({ length: 10 }, (_, index) => `old-${index}`));
  });
}

function createBridgeHistoryRuntime() {
  const runtime = createHistoryRuntime(`${source}\n${readingSource}`);
  const preferences = new Map();
  runtime.context.NSUserDefaults = { standardUserDefaults: () => ({
    objectForKey: (key) => preferences.get(key),
    setObjectForKey: (value, key) => preferences.set(key, value),
  }) };
  vm.runInNewContext(bridgeSource, runtime.context);
  return {
    ...runtime,
    commands: runtime.context.__MN_WEB_BRIDGE_COMMANDS_GLOBAL__.commands,
    importHistory: runtime.context.__MN_MOMO_IMPORT_HISTORY_GLOBAL__,
    readingHistory: runtime.context.__MN_MOMO_READING_HISTORY_GLOBAL__,
    preferences,
  };
}

test("History clear commands require confirmation and only clear the requested data", () => {
  const { commands, importHistory, readingHistory, preferences } = createBridgeHistoryRuntime();
  commands.saveSettings({}, { token: "keep-token", bookId: "book-1", readingOptions: { translation: true } });
  const settings = [...preferences.entries()];
  const imported = importHistory.recordImport({ words: ["alpha"], addWords: true }, { success: ["alpha"] }, {});
  readingHistory.recordArticle({ words: [{ id: 1, spelling: "alpha" }] }, { article: "Alpha works." });
  for (const command of [commands.clearImportHistory, commands.clearAiReadingHistory]) {
    for (const payload of [undefined, {}, { confirmed: false }]) assert.throws(() => command({}, payload), /请先确认/);
  }
  assert.equal(commands.clearAiReadingHistory({}, { confirmed: true }).cleared, true);
  assert.equal(readingHistory.listHistory().length, 0);
  assert.equal(importHistory.listHistory()[0].id, imported.id);
  readingHistory.recordArticle({ words: [{ id: 2, spelling: "beta" }] }, { article: "Beta works." });
  assert.equal(commands.clearImportHistory({}, { confirmed: true }).cleared, true);
  assert.equal(importHistory.listHistory().length, 0);
  assert.equal(readingHistory.listHistory()[0].article, "Beta works.");
  assert.deepEqual([...preferences.entries()], settings);
});

test("A reading request started before clearing cannot restore cleared history", async () => {
  const { commands, context, readingHistory } = createBridgeHistoryRuntime();
  let finish;
  context.__MN_DEEPSEEK_API_GLOBAL__ = { generateArticle: () => new Promise((resolve) => { finish = resolve; }) };
  const pending = commands.generateTodayReading({}, { settings: {}, words: [{ id: 1, spelling: "alpha" }] });
  commands.clearAiReadingHistory({}, { confirmed: true });
  finish({ article: "Alpha works." });
  await assert.rejects(pending, /历史已清除/);
  assert.equal(readingHistory.listHistory().length, 0);
});

test("An import request started before clearing cannot restore cleared history", async () => {
  const { commands, context, importHistory } = createBridgeHistoryRuntime();
  commands.saveSettings({}, { token: "keep-token", bookId: "book-1" });
  let finish;
  context.__MN_MOMO_API_GLOBAL__ = { importWords: () => new Promise((resolve) => { finish = resolve; }) };
  const pending = commands.importMomoWords({}, { words: ["alpha"], addWords: true });
  commands.clearImportHistory({}, { confirmed: true });
  finish({ success: ["alpha"], failed: [], duplicate: [] });
  const result = await pending;
  assert.match(result.historyError, /历史已清除/);
  assert.equal(importHistory.listHistory().length, 0);
});

test("A failed clear leaves existing reading requests able to save their results", async () => {
  const { commands, context, readingHistory, files } = createBridgeHistoryRuntime();
  let finish;
  context.__MN_DEEPSEEK_API_GLOBAL__ = { generateArticle: () => new Promise((resolve) => { finish = resolve; }) };
  const pending = commands.generateTodayReading({}, { settings: {}, words: [{ id: 1, spelling: "alpha" }] });
  files.set = () => { throw new Error("storage unavailable"); };
  assert.throws(() => commands.clearAiReadingHistory({}, { confirmed: true }), /storage unavailable/);
  files.set = Map.prototype.set;
  finish({ article: "Alpha works." });
  await pending;
  assert.equal(readingHistory.listHistory().length, 1);
});

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
  files.set("/documents/MoMoBridge/import-history.json", JSON.stringify({ entries: [] }));

  // 仅替换 JSON 解析器响应，以模拟桥接后的原生容器。
  const runtime = createHistoryRuntime();
  runtime.files.set("/documents/MoMoBridge/import-history.json", JSON.stringify({ entries: [] }));
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
