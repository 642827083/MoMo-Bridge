var __MN_MOMO_IMPORT_HISTORY_GLOBAL__ = (function () {
  const SCHEMA_VERSION = 1;
  const MAX_HISTORY_ENTRIES = 10;
  const DATA_DIRECTORY_NAME = "MoMoBridge";
  const HISTORY_FILE_NAME = "import-history.json";

  function dataDirectoryPath() {
    return `${Application.sharedInstance().documentPath}/${DATA_DIRECTORY_NAME}`;
  }

  function historyFilePath() {
    return `${dataDirectoryPath()}/${HISTORY_FILE_NAME}`;
  }

  function ensureDataDirectory() {
    const fileManager = NSFileManager.defaultManager();
    const directory = dataDirectoryPath();
    if (!fileManager.fileExistsAtPath(directory)) {
      const created = fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(
        directory,
        true,
        null,
      );
      if (!created) throw new Error("无法创建导入历史目录");
    }
    return directory;
  }

  function defaultDocument() {
    return { schemaVersion: SCHEMA_VERSION, entries: [] };
  }

  function valueForKey(object, key) {
    if (!object) return undefined;
    if (object[key] !== undefined) return object[key];
    return typeof object.objectForKey === "function" ? object.objectForKey(key) : undefined;
  }

  function arrayItems(list) {
    if (!list) return [];
    const rawCount = typeof list.count === "function"
      ? list.count()
      : list.count !== undefined ? list.count : list.length;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count < 1) return [];
    const result = [];
    for (let index = 0; index < count; index += 1) {
      result.push(typeof list.objectAtIndex === "function" ? list.objectAtIndex(index) : list[index]);
    }
    return result;
  }

  function dataLength(data) {
    if (!data) return 0;
    const length = typeof data.length === "function" ? data.length() : data.length;
    const number = Number(length);
    return Number.isFinite(number) ? number : 0;
  }

  function readDocument() {
    const path = historyFilePath();
    const fileManager = NSFileManager.defaultManager();
    if (!fileManager.fileExistsAtPath(path)) return defaultDocument();

    try {
      const data = NSData.dataWithContentsOfFile(path);
      if (!data || dataLength(data) === 0) return defaultDocument();
      const parsed = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
      const entries = arrayItems(valueForKey(parsed, "entries"));
      if (!parsed || typeof parsed !== "object") {
        return defaultDocument();
      }
      return {
        schemaVersion: SCHEMA_VERSION,
        entries: entries.map(restoreStoredEntry).filter(Boolean).slice(0, MAX_HISTORY_ENTRIES),
      };
    } catch (ignored) {
      // 无效的历史文件不能阻止新的导入任务。
      return defaultDocument();
    }
  }

  function writeDocument(document) {
    ensureDataDirectory();
    const safeDocument = {
      schemaVersion: SCHEMA_VERSION,
      entries: Array.isArray(document && document.entries)
        ? document.entries.slice(0, MAX_HISTORY_ENTRIES)
        : [],
    };
    const data = NSJSONSerialization.dataWithJSONObjectOptions(safeDocument, 0);
    if (!data || !data.writeToFileAtomically(historyFilePath(), true)) {
      throw new Error("无法保存导入历史");
    }
  }

  function stringList(values) {
    const result = [];
    const seen = {};
    for (const value of arrayItems(values)) {
      if (typeof value !== "string") continue;
      const text = value.trim();
      const key = text.toLowerCase();
      if (!text || seen[key]) continue;
      seen[key] = true;
      result.push(text);
    }
    return result;
  }

  function finiteCount(value) {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }

  function safeExample(value, includeReason) {
    if (!value || typeof value !== "object") return null;
    const rawWord = valueForKey(value, "word");
    const rawLemma = valueForKey(value, "lemma");
    const rawPhrase = valueForKey(value, "phrase");
    const rawInterpretation = valueForKey(value, "interpretation");
    const rawOrigin = valueForKey(value, "origin");
    const rawTitle = valueForKey(value, "title");
    const example = {
      word: typeof rawWord === "string" ? rawWord.trim() : "",
      lemma: typeof rawLemma === "string" ? rawLemma.trim() : "",
      phrase: typeof rawPhrase === "string" ? rawPhrase.trim() : "",
      interpretation: typeof rawInterpretation === "string" ? rawInterpretation.trim() : "",
      origin: typeof rawOrigin === "string" ? rawOrigin.trim() : "",
      title: typeof rawTitle === "string" ? rawTitle.trim() : "",
    };
    if (!example.word || !example.phrase || !example.interpretation) return null;
    if (includeReason) {
      const rawReason = valueForKey(value, "reason");
      example.reason = typeof rawReason === "string" ? rawReason.trim() : "";
    }
    return example;
  }

  function safeExamples(values, includeReason) {
    const result = [];
    for (const value of arrayItems(values)) {
      const example = safeExample(value, includeReason);
      if (example) result.push(example);
    }
    return result;
  }

  function safeOptions(payload) {
    return {
      addWords: valueForKey(payload, "addWords") === true,
      addExamples: valueForKey(payload, "addExamples") === true,
      addStudy: valueForKey(payload, "addStudy") === true,
      advanceStudy: valueForKey(payload, "addStudy") === true &&
        valueForKey(payload, "advanceStudy") === true,
    };
  }

  function safeResult(result) {
    const examples = valueForKey(result, "examples") || {};
    const study = valueForKey(result, "study") || {};
    const queue = valueForKey(examples, "queue") || {};
    return {
      words: {
        success: stringList(valueForKey(result, "success")),
        duplicate: stringList(valueForKey(result, "duplicate")),
        failed: stringList(valueForKey(result, "failed")),
      },
      examples: {
        success: safeExamples(valueForKey(examples, "success"), false),
        duplicate: safeExamples(valueForKey(examples, "duplicate"), false),
        failed: safeExamples(valueForKey(examples, "failed"), true),
        error: typeof valueForKey(examples, "error") === "string"
          ? valueForKey(examples, "error")
          : "",
        queue: {
          batchSize: finiteCount(valueForKey(queue, "batchSize")),
          totalBatches: finiteCount(valueForKey(queue, "totalBatches")),
          completedExamples: finiteCount(valueForKey(queue, "completedExamples")),
          retryCount: finiteCount(valueForKey(queue, "retryCount")),
        },
      },
      study: {
        requestedCount: finiteCount(valueForKey(study, "requestedCount")),
        resolvedCount: finiteCount(valueForKey(study, "resolvedCount")),
        addedCount: finiteCount(valueForKey(study, "addedCount")),
        notAddedCount: finiteCount(valueForKey(study, "notAddedCount")),
        missing: stringList(valueForKey(study, "missing")),
        advanceRequested: valueForKey(study, "advanceRequested") === true,
        advancedCount: finiteCount(valueForKey(study, "advancedCount")),
        notAdvancedCount: finiteCount(valueForKey(study, "notAdvancedCount")),
        advanceError: typeof valueForKey(study, "advanceError") === "string"
          ? valueForKey(study, "advanceError")
          : "",
        error: typeof valueForKey(study, "error") === "string"
          ? valueForKey(study, "error")
          : "",
      },
    };
  }

  function restoreStoredEntry(value) {
    if (!value || typeof value !== "object") return null;
    const options = valueForKey(value, "options") || {};
    const input = valueForKey(value, "input") || {};
    const result = valueForKey(value, "result") || {};
    const words = valueForKey(result, "words") || {};
    const examples = valueForKey(result, "examples") || {};
    const study = valueForKey(result, "study") || {};
    const queue = valueForKey(examples, "queue") || {};
    return {
      id: String(valueForKey(value, "id") || ""),
      createdAt: String(valueForKey(value, "createdAt") || ""),
      kind: valueForKey(value, "kind") === "retry" ? "retry" : "import",
      parentId: String(valueForKey(value, "parentId") || ""),
      bookId: String(valueForKey(value, "bookId") || ""),
      options: safeOptions(options),
      input: {
        words: stringList(valueForKey(input, "words")),
        wordbookWords: stringList(
          valueForKey(input, "wordbookWords") || valueForKey(input, "words"),
        ),
        studyWords: stringList(
          valueForKey(input, "studyWords") || valueForKey(input, "words"),
        ),
        examples: safeExamples(valueForKey(input, "examples"), false),
      },
      result: {
        words: {
          success: stringList(valueForKey(words, "success")),
          duplicate: stringList(valueForKey(words, "duplicate")),
          failed: stringList(valueForKey(words, "failed")),
        },
        examples: {
          success: safeExamples(valueForKey(examples, "success"), false),
          duplicate: safeExamples(valueForKey(examples, "duplicate"), false),
          failed: safeExamples(valueForKey(examples, "failed"), true),
          error: String(valueForKey(examples, "error") || ""),
          queue: {
            batchSize: finiteCount(valueForKey(queue, "batchSize")),
            totalBatches: finiteCount(valueForKey(queue, "totalBatches")),
            completedExamples: finiteCount(valueForKey(queue, "completedExamples")),
            retryCount: finiteCount(valueForKey(queue, "retryCount")),
          },
        },
        study: {
          requestedCount: finiteCount(valueForKey(study, "requestedCount")),
          resolvedCount: finiteCount(valueForKey(study, "resolvedCount")),
          addedCount: finiteCount(valueForKey(study, "addedCount")),
          notAddedCount: finiteCount(valueForKey(study, "notAddedCount")),
          missing: stringList(valueForKey(study, "missing")),
          advanceRequested: valueForKey(study, "advanceRequested") === true,
          advancedCount: finiteCount(valueForKey(study, "advancedCount")),
          notAdvancedCount: finiteCount(valueForKey(study, "notAdvancedCount")),
          advanceError: String(valueForKey(study, "advanceError") || ""),
          error: String(valueForKey(study, "error") || ""),
        },
      },
    };
  }

  function uniqueId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function retryPlan(entry) {
    if (!entry || typeof entry !== "object") return null;
    const options = entry.options || {};
    const result = entry.result || {};
    const wordResult = result.words || {};
    const exampleResult = result.examples || {};
    const studyResult = result.study || {};
    const failedWords = stringList(wordResult.failed);
    const failedExamples = safeExamples(exampleResult.failed, false);
    const retryStudy = options.addStudy === true && (
      finiteCount(studyResult.notAddedCount) > 0 ||
      stringList(studyResult.missing).length > 0 ||
      !!studyResult.error ||
      (options.advanceStudy === true && (
        finiteCount(studyResult.notAdvancedCount) > 0 || !!studyResult.advanceError
      ))
    );
    const addWords = options.addWords === true && failedWords.length > 0;
    const addExamples = options.addExamples === true && failedExamples.length > 0;
    const originalStudyWords = stringList(
      entry.input && entry.input.studyWords || entry.input && entry.input.words,
    );
    const words = [];
    if (addWords) words.push.apply(words, failedWords);
    if (addExamples) {
      for (const example of failedExamples) {
        words.push(example.lemma || example.word, example.word);
      }
    }
    if (retryStudy) words.push.apply(words, originalStudyWords);

    return {
      words: stringList(words),
      wordbookWords: failedWords,
      studyWords: retryStudy ? originalStudyWords : [],
      examples: failedExamples,
      addWords,
      addExamples,
      addStudy: retryStudy,
      advanceStudy: retryStudy && options.advanceStudy === true,
      bookId: typeof entry.bookId === "string" ? entry.bookId : "",
    };
  }

  function withRetrySummary(entry) {
    const plan = retryPlan(entry);
    return Object.assign({}, entry, {
      retry: {
        available: !!(plan && (plan.addWords || plan.addExamples || plan.addStudy)),
        wordCount: plan && plan.addWords ? plan.wordbookWords.length : 0,
        exampleCount: plan && plan.addExamples ? plan.examples.length : 0,
        studyCount: plan && plan.addStudy ? plan.studyWords.length : 0,
      },
    });
  }

  function recordImport(payload, result, metadata) {
    const document = readDocument();
    const entry = {
      id: uniqueId(),
      createdAt: new Date().toISOString(),
      kind: metadata && metadata.kind === "retry" ? "retry" : "import",
      parentId: metadata && typeof metadata.parentId === "string" ? metadata.parentId : "",
      bookId: metadata && typeof metadata.bookId === "string" ? metadata.bookId : "",
      options: safeOptions(payload),
      input: {
        words: stringList(payload && payload.words),
        wordbookWords: stringList(payload && payload.wordbookWords || payload && payload.words),
        studyWords: stringList(payload && payload.studyWords || payload && payload.words),
        examples: safeExamples(payload && payload.examples, false),
      },
      result: safeResult(result),
    };
    document.entries.unshift(entry);
    document.entries = document.entries.slice(0, MAX_HISTORY_ENTRIES);
    writeDocument(document);
    return withRetrySummary(entry);
  }

  function listHistory() {
    return readDocument().entries.map(withRetrySummary);
  }

  function clearHistory() {
    writeDocument(defaultDocument());
  }

  function findHistory(id) {
    const target = String(id || "");
    return readDocument().entries.find(function (entry) {
      return entry && entry.id === target;
    }) || null;
  }

  return {
    clearHistory,
    findHistory,
    listHistory,
    recordImport,
    retryPlan,
  };
})();
