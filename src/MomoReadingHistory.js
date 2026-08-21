var __MN_MOMO_READING_HISTORY_GLOBAL__ = (function () {
  const SCHEMA_VERSION = 1;
  const MAX_HISTORY_ENTRIES = 50;
  const DATA_DIRECTORY_NAME = "MoMoImport";
  const HISTORY_FILE_NAME = "reading-history.json";

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
      if (!created) throw new Error("无法创建阅读历史目录");
    }
  }

  function defaultDocument() {
    return { schemaVersion: SCHEMA_VERSION, entries: [] };
  }

  function safeWord(value) {
    if (!value || typeof value !== "object") return null;
    const rawId = valueForKey(value, "id");
    const rawSpelling = valueForKey(value, "spelling") || valueForKey(value, "voc_spelling");
    const spelling = typeof rawSpelling === "string" ? rawSpelling.trim() : "";
    const id = rawId === undefined || rawId === null ? "" : String(rawId);
    return id || spelling ? { id, spelling } : null;
  }

  function safeWords(values) {
    const result = [];
    const seen = {};
    for (const value of arrayItems(values)) {
      const word = safeWord(value);
      if (!word || !word.spelling) continue;
      const key = word.id ? `id:${word.id}` : `word:${word.spelling.toLowerCase()}`;
      if (seen[key]) continue;
      seen[key] = true;
      result.push(word);
    }
    return result;
  }

  function safeQuestion(value) {
    if (!value || typeof value !== "object") return null;
    const question = String(valueForKey(value, "question") || "").trim();
    const sourceOptions = valueForKey(value, "options") || {};
    const options = {};
    ["A", "B", "C", "D"].forEach(function (letter) {
      const option = valueForKey(sourceOptions, letter) || valueForKey(sourceOptions, letter.toLowerCase());
      options[letter] = typeof option === "string" ? option.trim() : "";
    });
    const answer = String(valueForKey(value, "answer") || "").trim().toUpperCase();
    const explanation = String(valueForKey(value, "explanation") || "").trim();
    if (!question || !explanation || !/^[ABCD]$/.test(answer)) return null;
    if (["A", "B", "C", "D"].some(function (letter) { return !options[letter]; })) return null;
    return { question, options, answer, explanation };
  }

  function safeQuestions(values) {
    return arrayItems(values).map(safeQuestion).filter(Boolean).slice(0, 5);
  }

  function safeParagraph(value) {
    if (typeof value === "string") {
      const english = value.trim();
      return english ? { english, translation: "" } : null;
    }
    if (!value || typeof value !== "object") return null;
    const english = String(
      valueForKey(value, "english") || valueForKey(value, "article") || valueForKey(value, "text") || "",
    ).trim();
    if (!english) return null;
    return {
      english,
      translation: String(valueForKey(value, "translation") || valueForKey(value, "chinese") || "").trim(),
    };
  }

  function safeParagraphs(values) {
    return arrayItems(values).map(safeParagraph).filter(Boolean);
  }

  function safeEntry(value) {
    if (!value || typeof value !== "object") return null;
    const paragraphs = safeParagraphs(valueForKey(value, "paragraphs"));
    const article = String(valueForKey(value, "article") || "").trim() || paragraphs
      .map(function (paragraph) { return paragraph.english; })
      .join("\n\n")
      .trim();
    const words = safeWords(valueForKey(value, "words"));
    if (!article || words.length === 0) return null;
    const rawTranslation = String(valueForKey(value, "translation") || "").trim();
    return {
      id: String(valueForKey(value, "id") || ""),
      createdAt: String(valueForKey(value, "createdAt") || ""),
      articleType: String(valueForKey(value, "articleType") || "cet4"),
      length: String(valueForKey(value, "length") || "medium"),
      includeTranslation: valueForKey(value, "includeTranslation") !== false,
      words,
      article,
      translation: rawTranslation || paragraphs
        .map(function (paragraph) { return paragraph.translation; })
        .filter(Boolean)
        .join("\n\n")
        .trim(),
      paragraphs,
      questions: safeQuestions(valueForKey(value, "questions")),
    };
  }

  function readDocument() {
    const path = historyFilePath();
    const fileManager = NSFileManager.defaultManager();
    if (!fileManager.fileExistsAtPath(path)) return defaultDocument();
    try {
      const data = NSData.dataWithContentsOfFile(path);
      if (!data) return defaultDocument();
      const parsed = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
      const entries = arrayItems(valueForKey(parsed, "entries"));
      return {
        schemaVersion: SCHEMA_VERSION,
        entries: entries.map(safeEntry).filter(Boolean).slice(0, MAX_HISTORY_ENTRIES),
      };
    } catch (ignored) {
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
      throw new Error("无法保存阅读历史");
    }
  }

  function uniqueId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function recordArticle(payload, result) {
    const source = result && typeof result === "object" ? result : {};
    const words = safeWords(valueForKey(source, "words") || valueForKey(payload, "words"));
    const entry = safeEntry({
      id: uniqueId(),
      createdAt: new Date().toISOString(),
      articleType: valueForKey(source, "articleType") || valueForKey(payload, "articleType"),
      length: valueForKey(source, "length") || valueForKey(payload, "length"),
      includeTranslation: valueForKey(source, "includeTranslation") !== false,
      words,
      article: valueForKey(source, "article"),
      translation: valueForKey(source, "translation"),
      paragraphs: valueForKey(source, "paragraphs"),
    });
    if (!entry) throw new Error("文章内容无效，无法保存阅读历史");
    const document = readDocument();
    document.entries.unshift(entry);
    document.entries = document.entries.slice(0, MAX_HISTORY_ENTRIES);
    writeDocument(document);
    return entry;
  }

  function recordQuestions(historyId, questions) {
    const targetId = String(historyId || "").trim();
    if (!targetId) throw new Error("缺少文章历史 ID，无法保存阅读题");
    const document = readDocument();
    const index = document.entries.findIndex(function (entry) {
      return entry && entry.id === targetId;
    });
    if (index < 0) throw new Error("未找到对应的文章历史，无法保存阅读题");
    const normalizedQuestions = safeQuestions(questions);
    if (normalizedQuestions.length < 3 || normalizedQuestions.length > 5) {
      throw new Error("阅读题数量应为 3 至 5 道");
    }
    document.entries[index] = Object.assign({}, document.entries[index], {
      questions: normalizedQuestions,
    });
    writeDocument(document);
    return document.entries[index];
  }

  function listHistory() {
    return readDocument().entries;
  }

  return {
    listHistory,
    recordArticle,
    recordQuestions,
  };
})();
