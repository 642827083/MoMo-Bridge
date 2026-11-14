import { useEffect, useMemo, useRef, useState } from "react";
import { collectLemmas } from "./domain/lemma.mjs";
import { collectCardImports } from "./domain/examples.mjs";
import {
  estimateInitialRemainingSeconds,
  remainingSecondsAt,
  updateEstimateDeadline,
} from "./domain/progressEstimate.mjs";
import MNBridge from "./lib/mnBridge";
import TokenVisibilityIcon from "./components/TokenVisibilityIcon";
import OptionCheck from "./components/OptionCheck";
import RefreshIcon from "./components/RefreshIcon";
import ReadingVocabulary from "./components/ReadingVocabulary";
import { ImportPreviewPanel, ImportHistoryPanel } from "./components/ImportContent";
import { importResultHasFailures } from "./domain/importPresentation.mjs";

const TOKEN_HELP_URL = "https://open.maimemo.com/#/";
const MAX_EXAMPLES_PER_IMPORT = 10;
const MAX_READING_WORDS = 30;
const READING_QUESTION_COUNT = 4;
const DEFAULT_READING_ARTICLE_TYPE = "postgraduate2";

const READING_ARTICLE_TYPES = [
  { value: "cet4", label: "四级" },
  { value: "cet6", label: "六级" },
  { value: "postgraduate1", label: "考研（英语一）" },
  { value: "postgraduate2", label: "考研（英语二）" },
];

const READING_LENGTHS = [
  { value: "short", label: "短文" },
  { value: "medium", label: "中等" },
  { value: "long", label: "长文" },
];

const AI_PROVIDERS = [
  { value: "mnchatai", label: "MN ChatAI", baseUrl: "", model: "当前配置模型" },
  { value: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { value: "siliconflow", label: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
  { value: "qwen", label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { value: "zhipu", label: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { value: "moonshot", label: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { value: "custom", label: "自定义服务商", baseUrl: "", model: "" },
];

function aiProviderDefinition(value) {
  return AI_PROVIDERS.find((provider) => provider.value === value)
    || AI_PROVIDERS.find((provider) => provider.value === "deepseek");
}

function aiProviderProfile(value, profile) {
  const provider = aiProviderDefinition(value);
  const source = profile && typeof profile === "object" ? profile : {};
  return {
    apiKey: typeof source.apiKey === "string" ? source.apiKey : "",
    baseUrl: typeof source.baseUrl === "string" ? source.baseUrl : provider.baseUrl,
    model: typeof source.model === "string" ? source.model : provider.model,
  };
}

function readingWordKeys(word) {
  if (!word || typeof word !== "object") return [];
  const keys = [];
  const id = word.id === undefined || word.id === null ? "" : String(word.id).trim();
  const spelling = typeof word.spelling === "string" ? word.spelling.trim().toLowerCase() : "";
  if (id) keys.push(`id:${id}`);
  if (spelling) keys.push(`word:${spelling}`);
  return keys;
}

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isCurrentLocalDay(value) {
  return localDayKey(value) !== "" && localDayKey(value) === localDayKey(new Date());
}

function generatedReadingKeys(entries, todayOnly = false) {
  const keys = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (todayOnly && !isCurrentLocalDay(entry?.createdAt)) continue;
    for (const word of Array.isArray(entry?.words) ? entry.words : []) {
      for (const key of readingWordKeys(word)) keys.add(key);
    }
  }
  return keys;
}

function chooseReadingWords(items, entries) {
  const generated = generatedReadingKeys(entries, true);
  return (Array.isArray(items) ? items : [])
    .filter((word) => readingWordKeys(word).every((key) => !generated.has(key)))
    .slice(0, MAX_READING_WORDS);
}

function historyOptions(entry) {
  return [
    entry?.options?.addWords ? "单词" : "",
    entry?.options?.addExamples ? "例句" : "",
    entry?.options?.addStudy ? "背诵" : "",
  ].filter(Boolean).join("、") || "未知操作";
}

function formatHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function readingHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const time = date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
  return isCurrentLocalDay(date)
    ? `今天 ${time}`
    : `${date.toLocaleDateString("zh-CN")} ${time}`;
}

function readingArticleTypeLabel(value) {
  const current = READING_ARTICLE_TYPES.find((item) => item.value === value);
  if (current) return current.label;
  if (value === "postgraduate") return "考研（旧记录）";
  return "英语阅读";
}

function formatRemainingTime(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (!value) return "即将完成";
  if (value < 60) return `约 ${value} 秒`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return remainder ? `约 ${minutes} 分 ${remainder} 秒` : `约 ${minutes} 分钟`;
}

function readingParagraphs(entry) {
  return (Array.isArray(entry?.paragraphs) ? entry.paragraphs : [])
    .map((paragraph) => ({
      english: typeof paragraph?.english === "string" ? paragraph.english.trim() : "",
      translation: typeof paragraph?.translation === "string" ? paragraph.translation.trim() : "",
    }))
    .filter((paragraph) => paragraph.english);
}

function readingEnglishText(entry) {
  const paragraphs = readingParagraphs(entry);
  return paragraphs.length
    ? paragraphs.map((paragraph) => paragraph.english).join("\n\n")
    : typeof entry?.article === "string" ? entry.article : "";
}

function escapeReadingRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readingWordForms(value) {
  const word = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!word) return [];
  const forms = new Set([word]);
  if (!/^[a-z]+$/.test(word)) return Array.from(forms);
  if (word.endsWith("y") && word.length > 2) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  }
  if (word.endsWith("e")) {
    forms.add(`${word}s`);
    forms.add(`${word}d`);
    forms.add(`${word.slice(0, -1)}ing`);
  } else {
    forms.add(/(?:s|x|z|ch|sh|o)$/.test(word) ? `${word}es` : `${word}s`);
    forms.add(`${word}ed`);
    forms.add(`${word}ing`);
  }
  return Array.from(forms);
}

function readingWordTerms(words) {
  const terms = new Set();
  for (const word of Array.isArray(words) ? words : []) {
    const spelling = typeof word === "string" ? word : word?.spelling;
    for (const form of readingWordForms(spelling)) terms.add(form);
  }
  return Array.from(terms).sort((first, second) => second.length - first.length);
}

function readingWordAppears(text, spelling) {
  const source = String(text || "");
  return readingWordForms(spelling).some((form) => (
    new RegExp(`\\b${escapeReadingRegExp(form)}\\b`, "i").test(source)
  ));
}

function readingWordSummary(entry) {
  const words = Array.isArray(entry?.words) ? entry.words : [];
  const missing = words.filter((word) => !readingWordAppears(readingEnglishText(entry), word?.spelling));
  return {
    total: words.length,
    used: Math.max(0, words.length - missing.length),
    missing,
  };
}

function renderHighlightedReadingText(text, words, enabled) {
  const source = String(text || "");
  if (!enabled) return source;
  const terms = readingWordTerms(words);
  if (!source || terms.length === 0) return source;
  const termSet = new Set(terms);
  const matcher = new RegExp(`\\b(${terms.map(escapeReadingRegExp).join("|")})\\b`, "gi");
  return source.split(matcher).map((segment, index) => {
    if (termSet.has(String(segment).toLowerCase())) {
      return <mark className="reading-word-highlight" key={`${segment}-${index}`}>{segment}</mark>;
    }
    return segment;
  });
}

function App() {
  const [readingControlsOpen, setReadingControlsOpen] = useState(true);
  const [momoAccountOpen, setMomoAccountOpen] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState("");
  const [token, setToken] = useState("");
  const [momoTokenDraft, setMomoTokenDraft] = useState("");
  const [showMomoToken, setShowMomoToken] = useState(false);
  const [momoSaving, setMomoSaving] = useState(false);
  const [momoPasting, setMomoPasting] = useState(false);
  const [momoMessage, setMomoMessage] = useState("");
  const [momoMessageKind, setMomoMessageKind] = useState("info");
  const [bookId, setBookId] = useState("");
  const [notepads, setNotepads] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("info");
  const [busy, setBusy] = useState(false);
  const [addWords, setAddWords] = useState(true);
  const [addExamples, setAddExamples] = useState(false);
  const [addStudy, setAddStudy] = useState(false);
  const [advanceStudy, setAdvanceStudy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [retryingHistoryId, setRetryingHistoryId] = useState("");
  const [importRightView, setImportRightView] = useState("preview");
  const [readingHistoryLoading, setReadingHistoryLoading] = useState(false);
  const [historyClearTarget, setHistoryClearTarget] = useState("");
  const [clearingHistory, setClearingHistory] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [historyMessageKind, setHistoryMessageKind] = useState("info");
  const [readingRightView, setReadingRightView] = useState("current");
  const [activePage, setActivePage] = useState("import");
  const [aiProvider, setAiProvider] = useState("deepseek");
  const [aiProfiles, setAiProfiles] = useState({});
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.deepseek.com");
  const [aiModel, setAiModel] = useState("deepseek-v4-flash");
  const [mnChatAiCatalog, setMnChatAiCatalog] = useState(null);
  const [mnChatAiSource, setMnChatAiSource] = useState("");
  const [mnChatAiModel, setMnChatAiModel] = useState("");
  const [mnChatAiLoading, setMnChatAiLoading] = useState(false);
  const [mnChatAiError, setMnChatAiError] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiPasting, setAiPasting] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiMessageKind, setAiMessageKind] = useState("info");
  const [todayItems, setTodayItems] = useState([]);
  const [readingHistory, setReadingHistory] = useState([]);
  const [readingSelection, setReadingSelection] = useState([]);
  const [readingArticleType, setReadingArticleType] = useState(DEFAULT_READING_ARTICLE_TYPE);
  const [readingLength, setReadingLength] = useState("medium");
  const [readingTranslation, setReadingTranslation] = useState(true);
  const [readingQuestionsEnabled, setReadingQuestionsEnabled] = useState(false);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [readingRequest, setReadingRequest] = useState(null);
  const [readingLoading, setReadingLoading] = useState(false);
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingCancelling, setReadingCancelling] = useState(false);
  const [readingQuestionsBusy, setReadingQuestionsBusy] = useState(false);
  const [readingQuestionsTargetId, setReadingQuestionsTargetId] = useState("");
  const [highlightReadingWords, setHighlightReadingWords] = useState(true);
  const [historyHighlightState, setHistoryHighlightState] = useState({});
  const [expandedReadingHistoryId, setExpandedReadingHistoryId] = useState("");
  const [readingMessage, setReadingMessage] = useState("");
  const [readingMessageKind, setReadingMessageKind] = useState("info");
  const [estimateDeadline, setEstimateDeadline] = useState(0);
  const [progressClock, setProgressClock] = useState(Date.now());

  const hasImportContent = addWords || addExamples || addStudy;
  const usesMnChatAi = aiProvider === "mnchatai";
  const aiConfigurationBusy = aiSaving || aiTesting || aiPasting || mnChatAiLoading || readingBusy || readingQuestionsBusy || Boolean(deletingHistoryId);
  const mnChatAiModels = mnChatAiCatalog?.sources?.find((item) => item.value === mnChatAiSource)?.models || [];
  const mnChatAiSelectionValid = mnChatAiModels.some((item) => item.value === mnChatAiModel);
  const mnChatAiSelectionChanged = Boolean(mnChatAiCatalog)
    && (mnChatAiSource !== mnChatAiCatalog.source || mnChatAiModel !== mnChatAiCatalog.model);
  const momoAccountBusy = momoSaving || momoPasting || busy || readingBusy || readingLoading || readingQuestionsBusy || Boolean(clearingHistory) || Boolean(deletingHistoryId);
  const historyMaintenanceBusy = Boolean(deletingHistoryId) || busy || readingBusy || readingQuestionsBusy || readingLoading
    || historyLoading || readingHistoryLoading || Boolean(clearingHistory);
  const needsBook = addWords;
  const canPreview = hasImportContent && token.trim() && (!needsBook || bookId.trim()) && !busy && !deletingHistoryId;
  const previewWords = preview ? preview.lemmas : [];
  const previewExamples = preview ? preview.examples || [] : [];
  const canConfirm = previewWords.length > 0 &&
    (addWords || addStudy || previewExamples.length > 0) &&
    canPreview && !result;
  const selectedActionNames = [
    addWords ? "单词" : "",
    addExamples ? "例句" : "",
    addStudy ? "背诵" : "",
  ].filter(Boolean);
  const confirmActionLabel = `确认添加${selectedActionNames.join("、")}`;
  const selectedBook = useMemo(
    () => notepads.find((notepad) => notepad.id === bookId),
    [bookId, notepads],
  );
  const generatedTodayKeys = useMemo(() => generatedReadingKeys(readingHistory, true), [readingHistory]);
  const generatedTodayCount = useMemo(
    () => todayItems.filter((word) => readingWordKeys(word).some((key) => generatedTodayKeys.has(key))).length,
    [generatedTodayKeys, todayItems],
  );
  const pendingTodayCount = Math.max(0, todayItems.length - generatedTodayCount);
  const currentArticleWordSummary = useMemo(
    () => readingWordSummary(currentArticle),
    [currentArticle],
  );
  const readingGenerationRef = useRef(0);
  const nativeReadingRequestRef = useRef("");
  const momoTokenInputRef = useRef(null);
  const aiKeyInputRef = useRef(null);
  const aiSettingsCardRef = useRef(null);
  const focusAiSettingsRef = useRef(false);
  const readingModelLabel = usesMnChatAi
    ? `MN ChatAI · ${mnChatAiLoading ? "正在读取模型…" : mnChatAiError ? "模型读取失败" : mnChatAiCatalog?.currentModel || "尚未读取模型"}`
    : `${aiProviderDefinition(aiProvider).label} · ${aiModel.trim() || "未配置模型"}`;

  function openAiSettings() {
    focusAiSettingsRef.current = true;
    setActivePage("settings");
  }

  useEffect(() => {
    if (activePage === "settings" && focusAiSettingsRef.current) {
      focusAiSettingsRef.current = false;
      aiSettingsCardRef.current?.scrollIntoView({ block: "start" });
      aiSettingsCardRef.current?.querySelector("select")?.focus({ preventScroll: true });
    }
  }, [activePage]);

  useEffect(() => {
    if (!busy || !estimateDeadline) return undefined;
    const timer = window.setInterval(() => setProgressClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy, estimateDeadline]);

  const progressEstimate = useMemo(() => {
    if (!importProgress || !estimateDeadline) return null;
    return { seconds: remainingSecondsAt(estimateDeadline, progressClock) };
  }, [estimateDeadline, importProgress, progressClock]);

  function beginProgressEstimate(exampleCount, extraRequestCount) {
    const now = Date.now();
    const seconds = estimateInitialRemainingSeconds(exampleCount, extraRequestCount);
    setEstimateDeadline(seconds > 0 ? now + seconds * 1000 : 0);
    setProgressClock(now);
    return seconds;
  }

  function receiveImportProgress(progress) {
    const now = Date.now();
    setImportProgress(progress);
    setEstimateDeadline((current) => updateEstimateDeadline(current, progress, now));
    setProgressClock(now);
  }

  function showImportMessage(text, kind = "error") {
    setMessageKind(kind);
    setMessage(text);
  }

  useEffect(() => {
    MNBridge.send("getSettings")
      .then((settings) => {
        setToken(settings.token || "");
        setMomoTokenDraft(settings.token || "");
        setBookId(settings.bookId || "");
        const importOptions = settings.importOptions && typeof settings.importOptions === "object"
          ? settings.importOptions
          : {};
        const readingOptions = settings.readingOptions && typeof settings.readingOptions === "object"
          ? settings.readingOptions
          : {};
        if (typeof importOptions.addWords === "boolean") setAddWords(importOptions.addWords);
        if (typeof importOptions.addExamples === "boolean") setAddExamples(importOptions.addExamples);
        if (typeof importOptions.addStudy === "boolean") setAddStudy(importOptions.addStudy);
        if (typeof importOptions.advanceStudy === "boolean") {
          setAdvanceStudy(importOptions.addStudy === true && importOptions.advanceStudy);
        }
        if (READING_ARTICLE_TYPES.some((item) => item.value === readingOptions.articleType)) {
          setReadingArticleType(readingOptions.articleType);
        }
        if (READING_LENGTHS.some((item) => item.value === readingOptions.length)) {
          setReadingLength(readingOptions.length);
        }
        if (typeof readingOptions.translation === "boolean") setReadingTranslation(readingOptions.translation);
        if (typeof readingOptions.questions === "boolean") setReadingQuestionsEnabled(readingOptions.questions);
      })
      .catch(() => showImportMessage("无法读取本机设置"));
    MNBridge.send("getAiSettings")
      .then((settings) => {
        const provider = aiProviderDefinition(settings.provider).value;
        const profiles = settings.providers && typeof settings.providers === "object"
          ? settings.providers
          : {};
        const current = aiProviderProfile(provider, profiles[provider] || settings);
        setAiProvider(provider);
        setAiProfiles(profiles);
        setAiApiKey(current.apiKey);
        setAiBaseUrl(current.baseUrl);
        setAiModel(current.model);
      })
      .catch(() => setAiMessage("无法读取 AI 配置"));
    loadImportHistory(false);
    loadReadingHistory();
  }, []);

  useEffect(() => {
    if (activePage === "reading") loadTodayReading(false);
  }, [activePage]);

  useEffect(() => {
    if (usesMnChatAi && ["settings", "reading"].includes(activePage)) loadMnChatAiModels();
  }, [usesMnChatAi, activePage]);

  function applyMnChatAiCatalog(payload) {
    setMnChatAiCatalog(payload);
    setMnChatAiSource(payload.source || "");
    setMnChatAiModel(payload.model || "");
  }

  async function loadMnChatAiModels() {
    setMnChatAiLoading(true);
    setMnChatAiError("");
    try {
      const payload = await MNBridge.send("getMnChatAiModels");
      applyMnChatAiCatalog(payload);
      if (!payload.sources?.length) setMnChatAiError("暂无可用模型，请先在 MN ChatAI 中配置服务商或刷新其内置模型。");
    } catch (error) {
      setMnChatAiError(error.message || "无法读取 MN ChatAI 模型列表");
    } finally {
      setMnChatAiLoading(false);
    }
  }

  async function loadImportHistory(showMessage = true) {
    try {
      setHistoryLoading(true);
      const payload = await MNBridge.send("listImportHistory");
      setHistoryEntries(Array.isArray(payload.entries) ? payload.entries : []);
      if (showMessage) showImportMessage("导入历史已刷新", "success");
    } catch (error) {
      if (showMessage) showImportMessage(error.message || "无法读取导入历史");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadReadingHistory(showMessage = false) {
    try {
      setReadingHistoryLoading(true);
      const payload = await MNBridge.send("listAiReadingHistory");
      setReadingHistory(Array.isArray(payload.entries) ? payload.entries : []);
      if (showMessage) {
        setReadingMessageKind("success");
        setReadingMessage("阅读历史已刷新");
      }
    } catch (error) {
      setHistoryMessageKind("error");
      setHistoryMessage(error.message || "无法读取 AI 阅读历史");
      if (showMessage) {
        setReadingMessageKind("error");
        setReadingMessage(error.message || "无法读取 AI 阅读历史");
      }
    } finally {
      setReadingHistoryLoading(false);
    }
  }

  async function deleteHistoryEntry(kind, entry) {
    if (historyMaintenanceBusy || kind !== "import") return;
    setDeletingHistoryId(`${kind}:${entry.id}`);
    try {
      const payload = await MNBridge.send("deleteImportHistory", {
        historyId: entry.id, confirmed: true,
      });
      if (payload.deleted !== true || !Array.isArray(payload.entries)) throw new Error("删除失败，请重试");
      setHistoryEntries(payload.entries);
      showImportMessage("这条导入历史已删除", "success");
    } catch (error) {
      showImportMessage(error.message || "删除历史失败");
    } finally {
      setDeletingHistoryId("");
    }
  }

  async function clearSelectedHistory() {
    if (historyMaintenanceBusy || !["import", "reading"].includes(historyClearTarget)) return;
    const target = historyClearTarget;
    try {
      setClearingHistory(target);
      setHistoryClearTarget("");
      setHistoryMessage("");
      const payload = await MNBridge.send(target === "import" ? "clearImportHistory" : "clearAiReadingHistory", {
        confirmed: true,
      });
      if (payload.cleared !== true) throw new Error("历史未清除，请重试");
      if (target === "import") {
        setHistoryEntries([]);
        setRetryingHistoryId("");
      } else {
        readingGenerationRef.current += 1;
        setReadingHistory([]);
        setCurrentArticle(null);
        setReadingSelection(chooseReadingWords(todayItems, []));
        setHistoryHighlightState({});
        setReadingQuestionsTargetId("");
        setReadingRightView("current");
        setReadingMessage("");
      }
      setHistoryMessageKind("success");
      setHistoryMessage(target === "import" ? "导入历史已清除" : "AI 阅读历史已清除，当前文章和已生成统计已重置");
    } catch (error) {
      setHistoryMessageKind("error");
      setHistoryMessage(error.message || "清除历史失败，请重试");
    } finally {
      setClearingHistory("");
    }
  }

  async function saveSettings(nextBookId = bookId, overrides = {}) {
    await MNBridge.send("saveSettings", {
      bookId: nextBookId,
      importOptions: {
        addWords: typeof overrides.addWords === "boolean" ? overrides.addWords : addWords,
        addExamples: typeof overrides.addExamples === "boolean" ? overrides.addExamples : addExamples,
        addStudy: typeof overrides.addStudy === "boolean" ? overrides.addStudy : addStudy,
        advanceStudy: typeof overrides.advanceStudy === "boolean"
          ? overrides.advanceStudy
          : advanceStudy,
      },
      readingOptions: {
        articleType: typeof overrides.articleType === "string" ? overrides.articleType : readingArticleType,
        length: typeof overrides.length === "string" ? overrides.length : readingLength,
        translation: typeof overrides.translation === "boolean" ? overrides.translation : readingTranslation,
        questions: typeof overrides.questions === "boolean" ? overrides.questions : readingQuestionsEnabled,
      },
    });
  }

  async function pasteMomoToken() {
    if (momoAccountBusy) return;
    setMomoPasting(true);
    setMomoMessage("");
    try {
      const payload = await MNBridge.send("getMomoTokenClipboard");
      if (typeof payload?.text !== "string" || !payload.text.trim()) {
        throw new Error("剪贴板没有文本，请先复制墨墨 Token");
      }
      setMomoTokenDraft(payload.text.trim());
      setShowMomoToken(false);
      setMomoMessageKind("info");
      setMomoMessage("已粘贴，请点击保存 Token");
    } catch (error) {
      setMomoMessageKind("error");
      setMomoMessage(error.message || "无法读取剪贴板，请长按输入框粘贴");
    } finally {
      setMomoPasting(false);
    }
  }

  async function saveMomoConfiguration(clear = false) {
    const nextToken = clear ? "" : momoTokenDraft.trim();
    if (!clear && !nextToken.replace(/^Bearer\s+/i, "").trim()) {
      setMomoMessageKind("error");
      setMomoMessage("请先填写墨墨开放 API Token");
      return;
    }
    try {
      setMomoSaving(true);
      setMomoMessage("");
      await MNBridge.send("saveMomoToken", { token: nextToken });
      if (nextToken !== token) {
        setNotepads([]);
        setPreview(null);
        setResult(null);
        setTodayItems([]);
        setReadingSelection([]);
      }
      setToken(nextToken);
      setMomoTokenDraft(nextToken);
      setShowMomoToken(false);
      setMomoMessageKind("success");
      setMomoMessage(clear ? "墨墨 Token 已清除" : "墨墨 Token 已保存，下次打开会自动读取");
    } catch (error) {
      setMomoMessageKind("error");
      setMomoMessage(error.message || (clear ? "清除墨墨 Token 失败" : "保存墨墨 Token 失败"));
    } finally {
      setMomoSaving(false);
    }
  }

  function switchAiProvider(nextProvider) {
    if (aiConfigurationBusy) return;
    const next = aiProviderDefinition(nextProvider).value;
    const currentDraft = aiProviderProfile(aiProvider, {
      apiKey: aiApiKey,
      baseUrl: aiBaseUrl,
      model: aiModel,
    });
    const nextDraft = aiProviderProfile(next, aiProfiles[next]);
    setAiProfiles((profiles) => ({ ...profiles, [aiProvider]: currentDraft }));
    setAiProvider(next);
    setAiApiKey(nextDraft.apiKey);
    setAiBaseUrl(nextDraft.baseUrl);
    setAiModel(nextDraft.model);
    setShowAiKey(false);
    setAiMessage("");
  }

  async function pasteAiKey() {
    if (aiConfigurationBusy) return;
    setAiPasting(true);
    setAiMessage("");
    try {
      const payload = await MNBridge.send("getAiKeyClipboard");
      if (typeof payload?.text !== "string" || !payload.text.trim()) {
        throw new Error("剪贴板没有文本，请先复制 API Key");
      }
      setAiApiKey(payload.text.trim());
      setShowAiKey(false);
      setAiMessageKind("info");
      setAiMessage("已粘贴，请点击保存设置");
    } catch (error) {
      setAiMessageKind("error");
      setAiMessage(error.message || "无法读取剪贴板，请长按输入框粘贴");
    } finally {
      setAiPasting(false);
    }
  }

  async function saveAiConfiguration() {
    if (usesMnChatAi && !mnChatAiSelectionValid) {
      setAiMessageKind("error");
      setAiMessage("请先选择可用的 MN ChatAI 服务商和模型");
      return;
    }
    try {
      setAiSaving(true);
      setAiMessage("");
      const currentDraft = aiProviderProfile(aiProvider, {
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel,
      });
      const profiles = { ...aiProfiles, [aiProvider]: currentDraft };
      const saved = await MNBridge.send("saveAiSettings", {
        provider: aiProvider,
        providers: profiles,
        ...currentDraft,
        ...(usesMnChatAi ? { mnChatAiSource, mnChatAiModel } : {}),
      });
      if (saved.mnChatAiSelection) applyMnChatAiCatalog(saved.mnChatAiSelection);
      setAiProfiles(profiles);
      setAiMessageKind("success");
      setAiMessage(`${aiProviderDefinition(aiProvider).label} 配置已保存`);
    } catch (error) {
      setAiMessageKind("error");
      setAiMessage(error.message || "保存 AI 配置失败");
    } finally {
      setAiSaving(false);
    }
  }

  async function testAiConnection() {
    if (usesMnChatAi && mnChatAiSelectionChanged) {
      setAiMessageKind("info");
      setAiMessage("请先保存所选模型，再测试连接");
      return;
    }
    if (!usesMnChatAi && !aiApiKey.trim()) {
      setAiMessageKind("error");
      setAiMessage(`请先填写 ${aiProviderDefinition(aiProvider).label} API Key`);
      return;
    }
    try {
      setAiTesting(true);
      setAiMessage("");
      const payload = await MNBridge.send("testAiConnection", {
        provider: aiProvider,
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel,
      });
      setAiMessageKind(payload.modelAvailable === false ? "warning" : "success");
      setAiMessage(payload.message || `${aiProviderDefinition(aiProvider).label} API 连接成功`);
    } catch (error) {
      setAiMessageKind("error");
      setAiMessage(error.message || `测试 ${aiProviderDefinition(aiProvider).label} 连接失败`);
    } finally {
      setAiTesting(false);
    }
  }

  async function loadTodayReading(showMessage = true) {
    if (!token.trim()) {
      setReadingMessageKind("error");
      setReadingMessage("请先在设置页面填写并保存墨墨 Token");
      return;
    }
    try {
      setReadingLoading(true);
      if (showMessage) setReadingMessage("");
      const [todayPayload, historyPayload] = await Promise.all([
        MNBridge.send("getTodayFinishedWords", { token }),
        MNBridge.send("listAiReadingHistory"),
      ]);
      const items = Array.isArray(todayPayload.items) ? todayPayload.items : [];
      const entries = Array.isArray(historyPayload.entries) ? historyPayload.entries : [];
      setTodayItems(items);
      setReadingHistory(entries);
      setReadingSelection(chooseReadingWords(items, entries));
    } catch (error) {
      setReadingMessageKind("error");
      setReadingMessage(error.message || "读取今日已背诵单词失败");
    } finally {
      setReadingLoading(false);
    }
  }

  async function requestReadingQuestionsForArticle(article, requestId) {
    const historyId = article?.historyEntry?.id || article?.id || "";
    if (!historyId) throw new Error("未找到文章历史记录，无法保存阅读题");
    const payload = await MNBridge.send("generateReadingQuestions", {
      settings: {
        provider: aiProvider,
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel,
      },
      historyId,
      article: article.article,
      words: article.words,
      articleType: article.articleType,
      questionCount: READING_QUESTION_COUNT,
      requestToken: nativeReadingRequestRef.current,
    });
    if (requestId !== undefined && requestId !== readingGenerationRef.current) {
      return { cancelled: true };
    }
    return {
      questions: Array.isArray(payload.questions) ? payload.questions : [],
      historyEntry: payload.historyEntry || article.historyEntry,
    };
  }

  async function requestReadingArticle(words, options = {}) {
    const selectedWords = Array.isArray(words) ? words : [];
    if (selectedWords.length === 0) {
      setReadingMessageKind("warning");
      setReadingMessage("没有待生成阅读内容的单词");
      return null;
    }
    if (!usesMnChatAi && !aiApiKey.trim()) {
      setReadingMessageKind("error");
      setReadingMessage(`请先在设置页面的 AI 设置中填写 ${aiProviderDefinition(aiProvider).label} API Key`);
      setActivePage("settings");
      setAiMessageKind("error");
      setAiMessage(`请先填写 ${aiProviderDefinition(aiProvider).label} API Key`);
      return null;
    }
    const articleType = options.articleType || readingArticleType;
    const length = options.length || readingLength;
    const includeTranslation = options.includeTranslation === undefined
      ? readingTranslation
      : options.includeTranslation !== false;
    const shouldGenerateQuestions = options.generateQuestions === undefined
      ? readingQuestionsEnabled
      : options.generateQuestions === true;
    const requestId = readingGenerationRef.current + 1;
    readingGenerationRef.current = requestId;
    nativeReadingRequestRef.current = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      setReadingRequest({ words: selectedWords, articleType, length, includeTranslation, generateQuestions: shouldGenerateQuestions });
      setReadingRightView("current");
      setReadingBusy(true);
      setReadingMessage("");
      const payload = await MNBridge.send("generateTodayReading", {
        requestToken: nativeReadingRequestRef.current,
        settings: {
          provider: aiProvider,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          model: aiModel,
        },
        words: selectedWords,
        articleType,
        length,
        includeTranslation,
      });
      if (requestId !== readingGenerationRef.current) return null;

      let article = payload;
      let questionError = null;
      if (shouldGenerateQuestions) {
        setReadingQuestionsBusy(true);
        setReadingMessageKind("info");
        setReadingMessage("文章已生成，正在生成阅读题…");
        try {
          const questionPayload = await requestReadingQuestionsForArticle(payload, requestId);
          if (questionPayload.cancelled) return null;
          article = {
            ...payload,
            questions: questionPayload.questions,
            historyEntry: questionPayload.historyEntry,
          };
        } catch (error) {
          questionError = error;
        } finally {
          if (requestId === readingGenerationRef.current) setReadingQuestionsBusy(false);
        }
      }

      if (requestId !== readingGenerationRef.current) return null;
      setCurrentArticle(article);
      if (article.historyEntry) {
        setReadingHistory((current) => {
          const withoutCurrent = current.filter((entry) => entry.id !== article.historyEntry.id);
          return [article.historyEntry, ...withoutCurrent].slice(0, 10);
        });
      }
      setReadingSelection([]);
      if (questionError) {
        setReadingMessageKind("warning");
        setReadingMessage(`文章生成成功，但阅读题生成失败：${questionError.message || "请稍后重试"}`);
      } else {
        setReadingMessageKind("success");
        setReadingMessage(
          shouldGenerateQuestions
            ? `文章和阅读题生成成功，本次使用 ${selectedWords.length} 个单词`
            : `文章生成成功，本次使用 ${selectedWords.length} 个单词`,
        );
      }
      return article;
    } catch (error) {
      if (requestId !== readingGenerationRef.current) return null;
      setReadingMessageKind("error");
      setReadingMessage(error.message || "生成 AI 阅读文章失败");
      return null;
    } finally {
      if (requestId === readingGenerationRef.current) {
        setReadingBusy(false);
        setReadingRequest(null);
      }
    }
  }

  async function pauseReadingGeneration() {
    if (!readingBusy || readingCancelling) return;
    readingGenerationRef.current += 1;
    setReadingCancelling(true);
    try {
      if (usesMnChatAi) {
        await MNBridge.send("cancelAiReadingGeneration", { requestToken: nativeReadingRequestRef.current });
      }
      setReadingMessageKind("warning");
      setReadingMessage("已暂停本次生成，可以修改文章类型或长度后重新生成");
    } catch (error) {
      setReadingMessageKind("error");
      setReadingMessage(error.message || "暂停失败，请稍后重试");
    } finally {
      setReadingBusy(false);
      setReadingQuestionsBusy(false);
      setReadingCancelling(false);
      setReadingRequest(null);
    }
  }

  async function generateSelectedReading() {
    let selectedWords = readingSelection;
    if (selectedWords.length === 0) {
      selectedWords = chooseReadingWords(todayItems, readingHistory);
      setReadingSelection(selectedWords);
    }
    await requestReadingArticle(selectedWords);
  }

  async function generateNextReading() {
    const nextWords = chooseReadingWords(todayItems, readingHistory);
    setReadingSelection(nextWords);
    await requestReadingArticle(nextWords);
  }

  async function regenerateReading() {
    await requestReadingArticle(currentArticle && currentArticle.words);
  }

  function readingArticleId(article) {
    return String(article?.historyEntry?.id || article?.id || "");
  }

  async function regenerateHistoryReading(entry) {
    if (!entry?.article) return;
    await requestReadingArticle(entry.words, {
      articleType: entry.articleType,
      length: entry.length,
      includeTranslation: entry.includeTranslation,
      generateQuestions: Array.isArray(entry.questions) && entry.questions.length > 0,
    });
  }

  async function generateReadingQuestionsForArticle(article) {
    if (!article?.article) return;
    if (!usesMnChatAi && !aiApiKey.trim()) {
      setReadingMessageKind("error");
      setReadingMessage(`请先在设置页面的 AI 设置中填写 ${aiProviderDefinition(aiProvider).label} API Key`);
      setActivePage("settings");
      setAiMessageKind("error");
      setAiMessage(`请先填写 ${aiProviderDefinition(aiProvider).label} API Key`);
      return;
    }
    const targetId = readingArticleId(article);
    try {
      setReadingQuestionsBusy(true);
      setReadingQuestionsTargetId(targetId);
      setReadingMessage("");
      const payload = await requestReadingQuestionsForArticle(article);
      const nextEntry = payload.historyEntry || { ...article, questions: payload.questions };
      setCurrentArticle((current) => readingArticleId(current) === targetId ? {
        ...current,
        questions: payload.questions,
        historyEntry: payload.historyEntry || current.historyEntry,
      } : current);
      setReadingHistory((current) => current.map((entry) => (
        entry.id === targetId ? nextEntry : entry
      )));
      setReadingMessageKind("success");
      setReadingMessage(`阅读题生成成功，共 ${payload.questions.length} 道`);
    } catch (error) {
      setReadingMessageKind("error");
      setReadingMessage(error.message || "生成阅读题失败");
    } finally {
      setReadingQuestionsBusy(false);
      setReadingQuestionsTargetId("");
    }
  }

  async function generateReadingQuestions() {
    await generateReadingQuestionsForArticle(currentArticle);
  }

  function renderReadingArticleActions(article, isHistory = false) {
    const articleId = readingArticleId(article);
    const hasQuestions = Array.isArray(article?.questions) && article.questions.length > 0;
    const questionLoading = readingQuestionsBusy && readingQuestionsTargetId === articleId;
    return (
      <div className={`reading-article-actions${isHistory ? " reading-history-article-actions" : ""}`}>
        <button className="reading-action-button" type="button"
          disabled={historyMaintenanceBusy}
          onClick={() => isHistory ? regenerateHistoryReading(article) : regenerateReading()}>
          重新生成文章
        </button>
        <button className="reading-action-button" type="button"
          disabled={historyMaintenanceBusy}
          onClick={() => isHistory ? generateReadingQuestionsForArticle(article) : generateReadingQuestions()}>
          {questionLoading ? "正在生成阅读题…" : hasQuestions ? "重新生成阅读题" : "生成阅读题"}
        </button>
      </div>
    );
  }

  function renderReadingPreparation() {
    const preparation = readingBusy && readingRequest ? readingRequest : {
      words: readingSelection,
      articleType: readingArticleType,
      length: readingLength,
      includeTranslation: readingTranslation,
      generateQuestions: readingQuestionsEnabled,
    };
    const status = readingCancelling ? "正在暂停生成…"
      : readingBusy ? readingQuestionsBusy ? "文章已生成，正在生成阅读题…" : "正在生成阅读文章…"
      : readingLoading ? "正在读取今日已背诵单词…" : "生成前预览";
    return (
      <section className="reading-preparation" aria-label="本次阅读预览" aria-busy={readingBusy || readingLoading}>
        <p className="reading-preparation-status" role="status">{status}</p>
        <h3>{readingBusy ? "本次使用" : "本次待使用"} · {preparation.words.length} 个单词</h3>
        <p className="reading-preparation-note">
          {readingBusy ? "完成后，文章会显示在这里。" : `每篇最多使用 ${MAX_READING_WORDS} 个未生成单词。`}
        </p>
        {preparation.words.length ? (
          <div className="reading-word-list reading-preparation-words" aria-label="本次使用的单词">
            {preparation.words.map((word) => <span key={`${word.id}-${word.spelling}`}>{word.spelling}</span>)}
          </div>
        ) : (
          <p className="reading-empty-note">
            {!token.trim() ? "请先在设置中保存墨墨 Token，再重新读取今日已背诵单词。"
              : todayItems.length === 0 ? "点击左侧“重新读取”，载入今日已背诵单词。"
              : "今日已背诵单词均已有对应阅读，可以在阅读历史中查看。"}
          </p>
        )}
        <div className="reading-preparation-options" aria-label="本次生成选项">
          <span>{readingArticleTypeLabel(preparation.articleType)}</span>
          <span>{READING_LENGTHS.find((item) => item.value === preparation.length)?.label || "中等"}</span>
          <span>{preparation.includeTranslation ? "含中文翻译" : "仅英文"}</span>
          {preparation.generateQuestions ? <span>含阅读题</span> : null}
        </div>
      </section>
    );
  }

  function renderCurrentReadingArticle() {
    if (!currentArticle) return null;
    return (
      <article className="reading-article">
        <div className="reading-article-heading">
          <div>
            <p className="eyebrow">本次 AI 阅读文章</p>
            <h3>{readingArticleTypeLabel(currentArticle.articleType)}</h3>
          </div>
          <div className="reading-article-heading-actions">
            <span>{currentArticle.words?.length || 0} 个单词</span>
          </div>
        </div>
        {currentArticle.words?.length ? (
          <details key={readingArticleId(currentArticle) || currentArticle.article} className="reading-word-details reading-article-words">
            <summary>本篇使用 · {currentArticle.words.length} 个单词</summary>
            <div className="reading-word-list">
              {currentArticle.words.map((word) => <span key={`${word.id}-${word.spelling}`}>{word.spelling}</span>)}
            </div>
          </details>
        ) : null}
        <ReadingVocabulary key={`vocabulary-${readingArticleId(currentArticle) || currentArticle.article}`}
          summary={currentArticleWordSummary} active={highlightReadingWords} onChange={setHighlightReadingWords} />
        {currentArticle.paragraphs?.length ? (
          <div className="reading-article-paragraphs">
            {currentArticle.paragraphs.map((paragraph, index) => (
              <div className="reading-article-paragraph" key={`${paragraph.english}-${index}`}>
                <div className="reading-article-body">
                  {renderHighlightedReadingText(paragraph.english, currentArticle.words, highlightReadingWords)}
                </div>
                {paragraph.translation ? (
                  <details className="reading-paragraph-translation">
                    <summary>显示本段翻译</summary>
                    <p>{paragraph.translation}</p>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="reading-article-body">
            {renderHighlightedReadingText(currentArticle.article, currentArticle.words, highlightReadingWords)}
          </div>
        )}
        {!currentArticle.paragraphs?.length && currentArticle.translation ? (
          <details className="reading-paragraph-translation">
            <summary>显示全文翻译</summary>
            <p>{currentArticle.translation}</p>
          </details>
        ) : null}
        {renderReadingArticleActions(currentArticle)}
      </article>
    );
  }

  function openTokenHelp(event) {
    event.preventDefault();
    setMomoMessage("");
    MNBridge.send("openExternalURL", { url: TOKEN_HELP_URL, browser: "safari" }).then((result) => {
      if (result?.opened !== true) throw new Error("未能打开浏览器");
    }).catch((error) => {
      setMomoMessageKind("error");
      setMomoMessage(`${error.message || "无法打开 Safari"}，请在 Safari 中手动访问 ${TOKEN_HELP_URL}`);
    });
  }

  async function loadNotepads() {
    if (!token.trim()) {
      showImportMessage("请先在设置页面填写并保存墨墨 Token");
      return;
    }

    try {
      setBusy(true);
      setMessage("");
      await saveSettings();
      const payload = await MNBridge.send("listMomoNotepads");
      setNotepads(payload.notepads || []);
      showImportMessage(`已加载 ${payload.notepads?.length || 0} 本云词本`, "success");
    } catch (error) {
      showImportMessage(error.message || "加载云词本失败");
    } finally {
      setBusy(false);
    }
  }

  async function previewSelection() {
    try {
      setImportRightView("preview");
      setBusy(true);
      setMessage("");
      setResult(null);
      setImportProgress(null);
      await saveSettings();
      const payload = await MNBridge.send("getSelectedCards");
      const cards = Array.isArray(payload.cards)
        ? payload.cards
        : (payload.titles || []).map((title) => ({ title, text: "" }));
      const parsed = collectCardImports(cards);
      // 保留仅标题解析器，兼容较旧的桥接版本。
      const titleParsed = cards.length > 0 && parsed.lemmas.length === 0
        ? collectLemmas(cards.map((card) => card.title))
        : null;
      const previewData = titleParsed
        ? { ...parsed, ...titleParsed, examples: [], cardsWithoutExamples: cards.map((card) => card.title) }
        : parsed;
      setPreview({ ...previewData, selectedCount: cards.length });
      if (previewData.lemmas.length === 0) {
        const selectedViewCount = payload.debug?.selectedViewCount;
        const titleSamples = payload.debug?.titleSamples?.filter(Boolean).join(" | ");
        const sampleMessage = titleSamples ? ` 标题样例：${titleSamples}` : "";
        showImportMessage(selectedViewCount === 0
          ? "MarginNote 未返回已选卡片，请保持卡片选中后再点击识别"
          : `已读取选中卡片，但未识别到可导入的单词原型。${sampleMessage}`);
      }
    } catch (error) {
      showImportMessage(error.message || "读取已选卡片失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!canConfirm) return;
    try {
      setBusy(true);
      setMessage("");
      const initialEstimate = beginProgressEstimate(
        addExamples ? previewExamples.length : 0,
        (addWords ? 3 : 0) + (addStudy ? 3 : 0),
      );
      setImportProgress(addExamples && previewExamples.length > 0 ? {
        phase: "uploading",
        batchIndex: 1,
        totalBatches: Math.ceil(previewExamples.length / MAX_EXAMPLES_PER_IMPORT),
        completedExamples: 0,
        totalExamples: previewExamples.length,
        retryCount: 0,
        estimatedRemainingSeconds: initialEstimate,
      } : null);
      const importResult = await MNBridge.send("importMomoWords", {
        words: previewWords,
        examples: preview?.examples || [],
        addWords,
        addExamples,
        addStudy,
        advanceStudy,
      }, {
        onProgress(progress) {
          receiveImportProgress(progress);
        },
      });
      setResult(importResult);
      const importHasFailures = importResultHasFailures(importResult, { addWords, addExamples, addStudy, advanceStudy });
      if (importResult.historyError) showImportMessage(importResult.historyError);
      else showImportMessage(importHasFailures
        ? "导入已结束，有失败项，请在导入历史中查看并重试" : "导入已完成",
      importHasFailures ? "error" : "success");
      await loadImportHistory(false);
    } catch (error) {
      showImportMessage(error.message || "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function retryHistory(entry) {
    if (!entry?.retry?.available || busy) return;
    try {
      setBusy(true);
      setRetryingHistoryId(entry.id);
      setMessage("");
      setResult(null);
      const initialEstimate = beginProgressEstimate(
        entry.retry.exampleCount,
        (entry.retry.wordCount > 0 ? 3 : 0) + (entry.retry.studyCount > 0 ? 3 : 0),
      );
      setImportProgress(entry.retry.exampleCount > 0 ? {
        phase: "uploading",
        batchIndex: 1,
        totalBatches: Math.ceil(entry.retry.exampleCount / MAX_EXAMPLES_PER_IMPORT),
        completedExamples: 0,
        totalExamples: entry.retry.exampleCount,
        retryCount: 0,
        estimatedRemainingSeconds: initialEstimate,
      } : null);
      const retryResult = await MNBridge.send("retryImportHistory", {
        historyId: entry.id,
      }, {
        onProgress(progress) {
          receiveImportProgress(progress);
        },
      });
      setResult(retryResult);
      setImportRightView("preview");
      setAddWords(entry.retry.wordCount > 0);
      setAddExamples(entry.retry.exampleCount > 0);
      setAddStudy(entry.retry.studyCount > 0);
      setAdvanceStudy(entry.retry.studyCount > 0 && entry.options?.advanceStudy === true);
      const retryHasFailures = importResultHasFailures(retryResult, {
        addWords: entry.retry.wordCount > 0, addExamples: entry.retry.exampleCount > 0,
        addStudy: entry.retry.studyCount > 0, advanceStudy: entry.retry.studyCount > 0 && entry.options?.advanceStudy === true,
      });
      showImportMessage(retryResult.historyError || (retryHasFailures
        ? "重试已结束，仍有失败项，请查看本次结果" : "失败项重试完成，结果已保存为新的历史记录"),
      retryResult.historyError || retryHasFailures ? "error" : "success");
      await loadImportHistory(false);
    } catch (error) {
      showImportMessage(error.message || "重试失败项失败");
      await loadImportHistory(false);
    } finally {
      setBusy(false);
      setRetryingHistoryId("");
    }
  }

  async function copyFailedWords() {
    if (!result?.failed?.length) return;
    try {
      await navigator.clipboard.writeText(result.failed.join("\n"));
      showImportMessage("失败单词已复制", "success");
    } catch (error) {
      showImportMessage("无法复制失败单词");
    }
  }

  return (
    <div className={`app-shell${activePage === "reading" ? " reading-page-shell" : activePage === "import" ? " import-page-shell" : ""}`}>
      <nav className="page-tabs" aria-label="功能页面">
        <span
          className="page-tab-indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${activePage === "import" ? 0 : activePage === "reading" ? 100 : 200}%)` }}
        />
        <button
          className={`page-tab${activePage === "import" ? " is-active" : ""}`}
          type="button"
          aria-current={activePage === "import" ? "page" : undefined}
          disabled={Boolean(clearingHistory)}
          onClick={() => setActivePage("import")}
        >
          墨墨导入
        </button>
        <button
          className={`page-tab${activePage === "reading" ? " is-active" : ""}`}
          type="button"
          aria-current={activePage === "reading" ? "page" : undefined}
          disabled={Boolean(clearingHistory)}
          onClick={() => setActivePage("reading")}
        >
          AI 阅读
        </button>
        <button
          className={`page-tab${activePage === "settings" ? " is-active" : ""}`}
          type="button"
          aria-current={activePage === "settings" ? "page" : undefined}
          disabled={Boolean(clearingHistory)}
          onClick={() => setActivePage("settings")}
        >
          设置
        </button>
      </nav>

      <div key={activePage} className="page-content">
      {activePage === "import" ? (
      <main key="import" className="import-layout">
        <section className="settings-column" aria-label="导入设置">
          <div className="import-settings-body">
            <div className="page-intro import-page-intro">
              <p className="eyebrow">墨墨词汇管理</p>
              <h2>墨墨导入</h2>
              <p>将脑图中选中的单词、例句和背诵计划同步到墨墨。</p>
            </div>
            {!token.trim() ? (
              <p className="momo-connection-hint">
                请先在设置中保存墨墨 Token。
                <button className="settings-link" type="button" onClick={() => setActivePage("settings")}>前往设置</button>
              </p>
            ) : null}
            <fieldset className="mode-block">
              <legend className="field-label">导入内容</legend>
              <div className="import-options">
                <label className={`import-option${addWords ? " is-selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={addWords}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAddWords(checked);
                      setResult(null);
                      setMessage("");
                      saveSettings(bookId, { addWords: checked }).catch(() => showImportMessage("保存导入设置失败"));
                    }}
                  />
                  <OptionCheck />
                  <span className="option-copy">
                    <strong>添加单词</strong>
                    <small>写入目标云词本</small>
                  </span>
                </label>
                <label className={`import-option${addExamples ? " is-selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={addExamples}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAddExamples(checked);
                      setResult(null);
                      setMessage("");
                      saveSettings(bookId, { addExamples: checked }).catch(() => showImportMessage("保存导入设置失败"));
                    }}
                  />
                  <OptionCheck />
                  <span className="option-copy">
                    <strong>添加例句</strong>
                    <small>上传原句与翻译</small>
                  </span>
                </label>
                <label className={`import-option${addStudy ? " is-selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={addStudy}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAddStudy(checked);
                      if (!checked) setAdvanceStudy(false);
                      setResult(null);
                      setMessage("");
                      saveSettings(bookId, {
                        addStudy: checked,
                        advanceStudy: checked && advanceStudy,
                      }).catch(() => showImportMessage("保存导入设置失败"));
                    }}
                  />
                  <OptionCheck />
                  <span className="option-copy">
                    <strong>添加背诵</strong>
                    <small>加入墨墨背诵列表</small>
                  </span>
                </label>
                {addStudy ? (
                  <div className="option-guidance study-advance-control">
                    <label className="study-advance-label" htmlFor="momo-advance-study">提前复习</label>
                    <details className="option-info">
                      <summary aria-label="查看背诵与提前复习说明" title="查看背诵与提前复习说明">i</summary>
                      <p>
                        <span className="option-info-line">添加背诵会占用墨墨账号的单词上限，达到上限后将无法继续添加。</span>
                        <span className="option-info-line">提前复习仅对已在背诵中的单词生效。</span>
                        <span className="option-info-line">提前复习需 10 级账号并开启墨墨自动同步。</span>
                        <span className="option-info-line">开启提前复习后会调整当前学习计划。</span>
                      </p>
                    </details>
                    <label className="study-advance-option">
                      <input
                        id="momo-advance-study"
                        aria-label="已在背诵中则提前复习"
                        type="checkbox"
                        role="switch"
                        checked={advanceStudy}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setAdvanceStudy(checked);
                          setResult(null);
                          setMessage("");
                          saveSettings(bookId, { advanceStudy: checked }).catch(() => showImportMessage("保存导入设置失败"));
                        }}
                      />
                      <span className="switch-track" aria-hidden="true">
                        <span className="switch-thumb" />
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
              {!hasImportContent ? (
                <p className="selection-note selection-warning" role="alert">请至少选择一种导入内容。</p>
              ) : null}
              <details className="import-guidance">
                <summary>导入说明</summary>
                <div>
                  <p>识别已选卡片后，请在右侧预览中确认内容，再提交导入。</p>
                  {addExamples ? (
                    <p className="option-guidance example-duration-note">
                      例句较多时会自动分批上传，所需时间通常比只添加单词更长。
                    </p>
                  ) : null}
                  {!addWords && hasImportContent ? <p>添加例句或背诵不需要选择目标云词本。</p> : null}
                  {addStudy ? <p>添加背诵使用墨墨公测接口，请先在墨墨 App 中开启自动同步。</p> : null}
                </div>
              </details>
            </fieldset>

            <div className="import-source-actions">
              <div className="book-row">
                <div className="field-block">
                  <label className="field-label" htmlFor="momo-book">目标云词本</label>
                  {notepads.length > 0 ? (
                    <select
                      id="momo-book"
                      value={bookId}
                      disabled={!needsBook}
                      onChange={(event) => {
                        const nextBookId = event.target.value;
                        setBookId(nextBookId);
                      setResult(null);
                      setMessage("");
                        saveSettings(nextBookId).catch(() => showImportMessage("保存目标云词本失败"));
                      }}
                    >
                      <option value="">选择云词本</option>
                      {notepads.map((notepad) => (
                        <option key={notepad.id} value={notepad.id}>{notepad.title}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="momo-book"
                      value={bookId}
                      disabled={!needsBook}
                      placeholder="云词本 ID"
                      onChange={(event) => {
                        setBookId(event.target.value);
                        setResult(null);
                        setMessage("");
                      }}
                      onBlur={() => saveSettings().catch(() => showImportMessage("保存目标云词本失败"))}
                    />
                  )}
                </div>
                <button className="secondary-button" type="button" disabled={busy || !needsBook} onClick={loadNotepads}>
                  加载词本
                </button>
              </div>

              {selectedBook ? <p className="selection-note">目标：{selectedBook.title}</p> : null}
            </div>
          </div>
          <div className="import-action-footer">
            <button className="primary-action import-detect-action" type="button" disabled={!canPreview} onClick={previewSelection}>
              识别已选卡片
            </button>
            <p className="import-detect-hint">从当前选中的脑图卡片读取单词、例句和翻译</p>
              {message ? <p className={`message is-${messageKind}`} role="status">{message}</p> : null}
          </div>
        </section>

        <section className="preview-column" aria-label="导入内容">
          <div className="reading-view-tabs" role="tablist" aria-label="导入内容视图">
            <button
              id="import-preview-tab"
              className={importRightView === "preview" ? "reading-view-tab is-active" : "reading-view-tab"}
              type="button"
              role="tab"
              aria-selected={importRightView === "preview"}
              aria-controls="import-preview-panel"
              onClick={() => setImportRightView("preview")}
            >
              导入预览
            </button>
            <button
              id="import-history-tab"
              className={importRightView === "history" ? "reading-view-tab is-active" : "reading-view-tab"}
              type="button"
              role="tab"
              aria-selected={importRightView === "history"}
              aria-controls="import-history-panel"
              onClick={() => setImportRightView("history")}
            >
              导入历史
            </button>
          </div>
          {importRightView === "preview" ? (
            <ImportPreviewPanel
              preview={preview} previewWords={previewWords} previewExamples={previewExamples}
              addWords={addWords} addExamples={addExamples} addStudy={addStudy} advanceStudy={advanceStudy}
              selectedActionNames={selectedActionNames} canConfirm={canConfirm} confirmActionLabel={confirmActionLabel}
              confirmImport={confirmImport} busy={busy} importProgress={importProgress} progressEstimate={progressEstimate}
              formatRemainingTime={formatRemainingTime} maxExamplesPerImport={MAX_EXAMPLES_PER_IMPORT}
              result={result} copyFailedWords={copyFailedWords}
            />
          ) : (
            <ImportHistoryPanel
              historyEntries={historyEntries} busy={busy || Boolean(deletingHistoryId)} historyLoading={historyLoading} loadImportHistory={loadImportHistory}
              formatHistoryTime={readingHistoryTime} historyOptions={historyOptions} tokenConfigured={Boolean(token.trim())}
              retryingHistoryId={retryingHistoryId} retryHistory={retryHistory}
              historyMaintenanceBusy={historyMaintenanceBusy} deletingHistoryId={deletingHistoryId}
              deleteHistoryEntry={deleteHistoryEntry}
            />
          )}
        </section>
      </main>
      ) : activePage === "reading" ? (
        <main key="reading" className="reading-layout" aria-label="AI 阅读">
          <section className="reading-card">
            <div className={`reading-settings-body${readingControlsOpen ? "" : " is-collapsed"}`}>
              <button className="reading-controls-toggle" type="button" aria-expanded={readingControlsOpen}
                aria-controls="reading-configuration" onClick={() => setReadingControlsOpen((current) => !current)}>
                <span>{readingArticleTypeLabel(readingArticleType)} · {READING_LENGTHS.find((item) => item.value === readingLength)?.label}{readingTranslation ? " · 含翻译" : ""}{readingQuestionsEnabled ? " · 含阅读题" : ""}</span>
                <span>{readingControlsOpen ? "收起配置" : "展开配置"}</span>
              </button>
              <div className="reading-configuration" id="reading-configuration">
                <div className="reading-heading">
                  <div>
                    <h2>AI 阅读</h2>
                    <p>根据今日已背诵单词生成英语阅读。</p>
                  </div>
                </div>

                <div className="reading-stat-grid">
                  <div><strong>{todayItems.length}<small>词</small></strong><span>今日已背诵</span></div>
                  <div><strong>{generatedTodayCount}<small>词</small></strong><span>已覆盖单词</span></div>
                  <div><strong>{pendingTodayCount}<small>词</small></strong><span>待使用单词</span></div>
                </div>

                <div className="reading-controls">
                  <div className="reading-control">
                    <label className="field-label" htmlFor="reading-article-type">文章类型</label>
                    <select
                      id="reading-article-type"
                      value={readingArticleType}
                      onChange={(event) => {
                        const value = event.target.value;
                        setReadingArticleType(value);
                        saveSettings(bookId, { articleType: value }).catch(() => setReadingMessage("保存阅读设置失败"));
                      }}
                    >
                      {READING_ARTICLE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div className="reading-control">
                    <label className="field-label" htmlFor="reading-length">文章长度</label>
                    <select
                      id="reading-length"
                      value={readingLength}
                      onChange={(event) => {
                        const value = event.target.value;
                        setReadingLength(value);
                        saveSettings(bookId, { length: value }).catch(() => setReadingMessage("保存阅读设置失败"));
                      }}
                    >
                      {READING_LENGTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div className="reading-reading-options">
                    <label className="reading-translation-option">
                      <input
                        id="reading-translation"
                        type="checkbox"
                        checked={readingTranslation}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setReadingTranslation(checked);
                          saveSettings(bookId, { translation: checked }).catch(() => setReadingMessage("保存阅读设置失败"));
                        }}
                      />
                      <OptionCheck />
                      <span>生成中文翻译</span>
                    </label>
                    <label className="reading-translation-option">
                      <input
                        id="reading-questions"
                        type="checkbox"
                        checked={readingQuestionsEnabled}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setReadingQuestionsEnabled(checked);
                          saveSettings(bookId, { questions: checked }).catch(() => setReadingMessage("保存阅读设置失败"));
                        }}
                      />
                      <OptionCheck />
                      <span>同时生成阅读题</span>
                    </label>
                  </div>
                </div>

            </div>

            </div>
            <div className="reading-action-footer">
              <button className="reading-model-link" type="button" onClick={openAiSettings} title="前往 AI 设置">
                <span>{readingModelLabel}</span><span aria-hidden="true">›</span>
              </button>
              <div className="reading-actions">
                <button
                  className="secondary-button reading-action-button"
                  type="button"
                  disabled={readingLoading || readingBusy || readingQuestionsBusy || Boolean(deletingHistoryId)}
                  onClick={() => loadTodayReading(true)}
                >
                  {readingLoading ? "读取中…" : "重新读取"}
                </button>
                <button
                  className={readingBusy ? "secondary-button reading-action-button" : "primary-action reading-action-button"}
                  type="button"
                  disabled={readingCancelling || readingLoading || Boolean(deletingHistoryId) || (!readingBusy && (readingQuestionsBusy || readingSelection.length === 0))}
                  onClick={readingBusy ? pauseReadingGeneration : currentArticle ? generateNextReading : generateSelectedReading}
                >
                  {readingCancelling ? "正在暂停…" : readingBusy ? "暂停生成" : currentArticle ? "生成下一篇" : "生成 AI 阅读"}
                </button>
              </div>
              {readingMessage ? <p className={`reading-message is-${readingMessageKind}`} role="status">{readingMessage}</p> : null}
            </div>

          </section>

          <section className="reading-history-card" aria-label="AI 阅读内容">
            <div className="reading-view-tabs" role="tablist" aria-label="阅读内容视图">
              <button
                className={readingRightView === "current" ? "reading-view-tab is-active" : "reading-view-tab"}
                type="button"
                role="tab"
                aria-selected={readingRightView === "current"}
                onClick={() => setReadingRightView("current")}
              >
                本次阅读
              </button>
              <button
                className={readingRightView === "history" ? "reading-view-tab is-active" : "reading-view-tab"}
                type="button"
                role="tab"
                aria-selected={readingRightView === "history"}
                onClick={() => setReadingRightView("history")}
              >
                阅读历史
              </button>
            </div>

            {readingRightView === "current" ? (
              <>
                {readingBusy || !currentArticle ? renderReadingPreparation() : renderCurrentReadingArticle()}
            {!readingBusy && currentArticle?.questions?.length ? (
              <section className="reading-questions" aria-label="阅读理解题">
                <div className="reading-questions-heading">
                  <div>
                    <p className="eyebrow">文章练习</p>
                    <strong>阅读理解题</strong>
                  </div>
                  <span>{currentArticle.questions.length} 道</span>
                </div>
                <div className="reading-question-list">
                  {currentArticle.questions.map((item, index) => (
                    <div className="reading-question-item" key={`${item.question}-${index}`}>
                      <p className="reading-question-title"><strong>{index + 1}.</strong> {item.question}</p>
                      <div className="reading-question-options">
                        {["A", "B", "C", "D"].map((letter) => (
                          <div key={letter}><strong>{letter}.</strong> {item.options?.[letter]}</div>
                        ))}
                      </div>
                      <details className="reading-answer-details">
                        <summary>查看答案与解析</summary>
                        <div className="reading-answer-content">
                          <p><strong>答案：{item.answer}</strong></p>
                          <p>解析：{item.explanation}</p>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </section>
                ) : null}
              </>
            ) : (
              <>
            <div className="history-heading">
              <h3>最近 {readingHistory.length} 篇阅读</h3>
              <button className="history-refresh reading-history-refresh" type="button"
                aria-label={readingHistoryLoading ? "正在刷新阅读历史" : "刷新阅读历史"}
                title="刷新阅读历史" disabled={readingHistoryLoading || readingBusy || readingQuestionsBusy || Boolean(deletingHistoryId)}
                onClick={() => loadReadingHistory(true)}>
                <RefreshIcon />
              </button>
            </div>
            <p className="history-privacy">最多保留最近 10 次，不保存墨墨 Token 或各 AI 服务商 API Key。</p>
            {readingHistory.length ? (
              <div className="reading-history-list">
                {readingHistory.map((entry) => (
                  <details className="reading-history-item" key={entry.id} open={expandedReadingHistoryId === entry.id}>
                    <summary onClick={(event) => {
                      event.preventDefault();
                      setExpandedReadingHistoryId((current) => current === entry.id ? "" : entry.id);
                    }}>
                      <span className="reading-history-summary-text">
                        <span className="reading-history-meta">
                          <span className="reading-history-labels">
                          <strong>{readingArticleTypeLabel(entry.articleType)} · {READING_LENGTHS.find((item) => item.value === entry.length)?.label || "中等"}</strong>
                          <small>{entry.words?.length || 0} 个单词{entry.questions?.length ? ` · ${entry.questions.length} 道题` : ""}</small>
                          </span>
                          <time>{readingHistoryTime(entry.createdAt)}</time>
                        </span>
                        <span className="reading-history-excerpt">{readingEnglishText(entry).replace(/\s+/g, " ").trim()}</span>
                      </span>
                      <span className="reading-history-chevron" aria-hidden="true">›</span>
                    </summary>
                    <div className="reading-history-content">
                      <ReadingVocabulary summary={readingWordSummary(entry)} active={historyHighlightState[entry.id] !== false}
                          onChange={(active) => setHistoryHighlightState((current) => ({
                              ...current,
                              [entry.id]: active,
                            }))} />
                      {entry.paragraphs?.length ? (
                        <div className="reading-history-paragraphs">
                          {entry.paragraphs.map((paragraph, index) => (
                            <div className="reading-history-paragraph" key={`${paragraph.english}-${index}`}>
                              <p>{renderHighlightedReadingText(
                                paragraph.english,
                                entry.words,
                                historyHighlightState[entry.id] !== false,
                              )}</p>
                              {paragraph.translation ? (
                                <details className="reading-history-translation">
                                  <summary>显示本段翻译</summary>
                                  <p>{paragraph.translation}</p>
                                </details>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>{renderHighlightedReadingText(
                          entry.article,
                          entry.words,
                          historyHighlightState[entry.id] !== false,
                        )}</p>
                      )}
                      {!entry.paragraphs?.length && entry.translation ? (
                        <details className="reading-history-translation">
                          <summary>显示全文翻译</summary>
                          <p>{entry.translation}</p>
                        </details>
                      ) : null}
                      {renderReadingArticleActions(entry, true)}
                      {entry.questions?.length ? (
                        <div className="reading-history-questions">
                          <strong>阅读理解题</strong>
                          {entry.questions.map((item, index) => (
                            <div className="reading-history-question" key={`${item.question}-${index}`}>
                              <p className="reading-question-title"><strong>{index + 1}.</strong> {item.question}</p>
                              <div className="reading-question-options">
                                {["A", "B", "C", "D"].map((letter) => (
                                  <div key={letter}><strong>{letter}.</strong> {item.options?.[letter]}</div>
                                ))}
                              </div>
                              <details className="reading-answer-details">
                                <summary>查看答案与解析</summary>
                                <div className="reading-answer-content">
                                  <p><strong>答案：{item.answer}</strong></p>
                                  <p>解析：{item.explanation}</p>
                                </div>
                              </details>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="history-empty reading-history-empty">生成文章后，这里会保存阅读历史。</div>
            )}
              </>
            )}
          </section>
        </main>
      ) : (
        <main key="settings" className="ai-settings-layout settings-layout" aria-label="设置">
          <section className="momo-account-card" aria-labelledby="momo-account-title">
            <div className="ai-settings-heading">
              <p className="eyebrow">墨墨连接配置</p>
              <h2 id="momo-account-title">墨墨账号</h2>
              <p>首次填写并保存 Token 后，导入和 AI 阅读会自动使用。</p>
            </div>
            <p className={`momo-account-status${token.trim() ? " is-configured" : ""}`}>
              {token.trim() ? "已保存 Token" : "未配置 Token"}
            </p>
            {token.trim() && !momoAccountOpen ? (
              <button className="secondary-button account-edit-button" type="button" onClick={() => setMomoAccountOpen(true)}>修改 Token</button>
            ) : (
              <div className="momo-account-editor">
                <div className="token-field">
                  <label className="field-label" htmlFor="momo-token">墨墨 Token</label>
                  <a
                    className="token-help"
                    href={TOKEN_HELP_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={openTokenHelp}
                  >
                    如何获取墨墨 Token
                  </a>
                  <div className="secret-input-row">
                    <div className="token-input-control">
                      <input
                        ref={momoTokenInputRef}
                        id="momo-token"
                        type={showMomoToken ? "text" : "password"}
                        value={momoTokenDraft}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={momoAccountBusy}
                        placeholder="粘贴 Token"
                        onChange={(event) => {
                          setMomoTokenDraft(event.target.value);
                          setMomoMessage("");
                        }}
                      />
                      <button
                        className="token-visibility-button"
                        type="button"
                        disabled={momoAccountBusy}
                        aria-label={showMomoToken ? "隐藏墨墨 Token" : "显示墨墨 Token"}
                        title={showMomoToken ? "隐藏 Token" : "显示 Token"}
                        aria-controls="momo-token"
                        aria-pressed={showMomoToken}
                        onClick={() => {
                          setShowMomoToken((current) => !current);
                          momoTokenInputRef.current?.focus();
                        }}
                      >
                        <TokenVisibilityIcon visible={showMomoToken} />
                      </button>
                    </div>
                    <button
                      className="field-action"
                      type="button"
                      disabled={momoAccountBusy}
                      aria-label="粘贴墨墨 Token"
                      onClick={pasteMomoToken}
                    >
                      {momoPasting ? "粘贴中…" : "粘贴"}
                    </button>
                  </div>
                  <p className="field-hint">修改后点击保存才会生效；Token 失效时在这里更新。</p>
                </div>
                <div className="ai-actions momo-account-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={momoAccountBusy || (!token && !momoTokenDraft)}
                    onClick={() => saveMomoConfiguration(true)}
                  >
                    清除 Token
                  </button>
                  <button
                    className="primary-action"
                    type="button"
                    disabled={momoAccountBusy}
                    onClick={() => saveMomoConfiguration()}
                  >
                    {momoSaving ? "保存中…" : "保存 Token"}
                  </button>
                </div>
                {momoMessage ? (
                  <p className={`ai-message is-${momoMessageKind}`} role="status">{momoMessage}</p>
                ) : null}
              {token.trim() ? <button className="settings-link" type="button" disabled={momoAccountBusy} onClick={() => {
                setMomoTokenDraft(token);
                setShowMomoToken(false);
                setMomoAccountOpen(false);
              }}>收起修改</button> : null}
              </div>
            )}
            <p className="ai-privacy-note">Token 仅保存在本机，不写入卡片或导入历史。</p>
          </section>
          <section className="ai-settings-card" ref={aiSettingsCardRef}>
            <div className="ai-settings-heading">
              <p className="eyebrow">AI 服务配置</p>
              <h2>AI 设置</h2>
              <p>配置用于生成 AI 阅读文章的 AI 服务，并分别保存各服务商的配置。</p>
            </div>

            <div className="ai-settings-form">
              <div className="ai-field">
                <label className="field-label" htmlFor="ai-provider">AI 服务商</label>
                <select
                  id="ai-provider"
                  disabled={aiConfigurationBusy}
                  value={aiProvider}
                  onChange={(event) => switchAiProvider(event.target.value)}
                >
                  {AI_PROVIDERS.map((provider) => (
                    <option key={provider.value} value={provider.value}>{provider.label}</option>
                  ))}
                </select>
                <p className="field-hint">{usesMnChatAi ? "使用 MN ChatAI 中当前配置的模型，无需在这里填写 API Key。" : "切换服务商会自动带入对应 API 地址和推荐模型。"}</p>
              </div>

              {usesMnChatAi ? (
                <>
                  <div className="ai-field">
                    <label className="field-label" htmlFor="mnchatai-source">MN ChatAI 服务商</label>
                    <select id="mnchatai-source" value={mnChatAiSource} disabled={aiConfigurationBusy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMnChatAiSource(value);
                        setMnChatAiModel(mnChatAiCatalog?.sources?.find((item) => item.value === value)?.models?.[0]?.value || "");
                        setAiMessage("");
                      }}>
                      <option value="" disabled>{mnChatAiLoading ? "正在读取…" : "请选择服务商"}</option>
                      {(mnChatAiCatalog?.sources || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div className="ai-field">
                    <label className="field-label" htmlFor="mnchatai-model">模型</label>
                    <div className="secret-input-row">
                      <select id="mnchatai-model" value={mnChatAiModel} disabled={aiConfigurationBusy || !mnChatAiModels.length}
                        onChange={(event) => { setMnChatAiModel(event.target.value); setAiMessage(""); }}>
                        <option value="" disabled>请选择模型</option>
                        {mnChatAiModels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                      <button className="field-action" type="button" disabled={aiConfigurationBusy} onClick={loadMnChatAiModels}>刷新</button>
                    </div>
                    <p className="field-hint">当前使用：{mnChatAiCatalog?.currentModel ? `${mnChatAiCatalog.currentSource} · ${mnChatAiCatalog.currentModel}` : "尚未读取"}</p>
                    <p className="field-hint">保存后同步修改 MN ChatAI 的默认模型。文章在后台生成，结果直接显示在本插件中。</p>
                    {mnChatAiError ? <p className="ai-message is-error" role="status">{mnChatAiError}</p> : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="ai-field">
                    <label className="field-label" htmlFor="ai-api-key">{aiProviderDefinition(aiProvider).label} API Key</label>
                    <div className="secret-input-row">
                      <div className="token-input-control">
                      <input
                        ref={aiKeyInputRef}
                        id="ai-api-key"
                        type={showAiKey ? "text" : "password"}
                        value={aiApiKey}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={aiConfigurationBusy}
                        placeholder={`粘贴 ${aiProviderDefinition(aiProvider).label} API Key`}
                        onChange={(event) => setAiApiKey(event.target.value)}
                      />
                      <button
                        className="token-visibility-button"
                        type="button"
                        disabled={aiConfigurationBusy}
                        aria-label={showAiKey ? "隐藏 API Key" : "显示 API Key"}
                        title={showAiKey ? "隐藏 API Key" : "显示 API Key"}
                        aria-controls="ai-api-key"
                        aria-pressed={showAiKey}
                        onClick={() => {
                          setShowAiKey((current) => !current);
                          aiKeyInputRef.current?.focus();
                        }}
                      >
                        <TokenVisibilityIcon visible={showAiKey} />
                      </button>
                      </div>
                      <button className="field-action" type="button" disabled={aiConfigurationBusy}
                        aria-label="粘贴 API Key" onClick={pasteAiKey}>
                        {aiPasting ? "粘贴中…" : "粘贴"}
                      </button>
                    </div>
                  </div>

                  <div className="ai-field">
                    <label className="field-label" htmlFor="ai-model">模型</label>
                    <input
                      id="ai-model"
                      disabled={aiConfigurationBusy}
                      value={aiModel}
                      placeholder={aiProviderDefinition(aiProvider).model || "填写服务商模型名称"}
                      onChange={(event) => setAiModel(event.target.value)}
                    />
                  </div>

                  <details className="ai-advanced-settings" open={aiProvider === "custom" ? true : undefined}>
                    <summary>高级设置</summary>
                    <div className="ai-field">
                      <label className="field-label" htmlFor="ai-base-url">API 地址</label>
                      <input
                        id="ai-base-url"
                        disabled={aiConfigurationBusy}
                        type="url"
                        value={aiBaseUrl}
                        placeholder={aiProviderDefinition(aiProvider).baseUrl || "https://example.com/v1"}
                        onChange={(event) => setAiBaseUrl(event.target.value)}
                      />
                      <p className="field-hint">已自动填入默认地址，也可以改为兼容 OpenAI 格式的代理地址。</p>
                    </div>
                  </details>
                </>
              )}
            </div>

            <div className="ai-actions">
              <button className="secondary-button" type="button" disabled={aiConfigurationBusy || usesMnChatAi && (!mnChatAiSelectionValid || mnChatAiSelectionChanged)} onClick={testAiConnection}>
                {aiTesting ? "测试中…" : "测试连接"}
              </button>
              <button className="primary-action" type="button" disabled={aiConfigurationBusy} onClick={saveAiConfiguration}>
                {aiSaving ? "保存中…" : "保存设置"}
              </button>
            </div>

            {aiMessage ? (
              <p className={`ai-message is-${aiMessageKind}`} role="status">{aiMessage}</p>
            ) : null}
            <p className="ai-privacy-note">各服务商 API Key 仅保存在本机，用于生成 AI 阅读文章，不会发送给墨墨或写入导入历史。</p>
          </section>
          <section className="history-management-card" aria-labelledby="history-management-title">
            <div className="ai-settings-heading">
              <p className="eyebrow">本机数据</p>
              <h2 id="history-management-title">历史管理</h2>
              <p>导入历史和 AI 阅读历史各保留最近 10 次。</p>
            </div>
            {[
              { value: "import", label: "导入历史", count: historyEntries.length, loading: historyLoading },
              { value: "reading", label: "AI 阅读历史", count: readingHistory.length, loading: readingHistoryLoading },
            ].map((item) => (
              <div className="history-management-row" key={item.value}>
                <div>
                  <h3>{item.label}</h3>
                  <p>{item.loading ? "正在读取记录…" : `当前保存 ${item.count} 次记录`}</p>
                </div>
                <button
                  className="history-clear-button"
                  type="button"
                  disabled={historyMaintenanceBusy || Boolean(historyClearTarget) || item.count === 0}
                  onClick={() => {
                    setHistoryMessage("");
                    setHistoryClearTarget(item.value);
                  }}
                >
                  {clearingHistory === item.value ? "清除中…" : `清除${item.label}`}
                </button>
              </div>
            ))}
            {historyClearTarget ? (
              <div className="history-clear-confirmation" role="group" aria-label="确认清除历史">
                <p>
                  {historyClearTarget === "import"
                    ? "确认清除本机全部导入历史？清除后将无法从历史重试失败项。"
                    : "确认清除本机全部 AI 阅读历史？当前文章和已生成统计也会重置。"}
                </p>
                <div>
                  <button className="secondary-button" type="button" onClick={() => setHistoryClearTarget("")}>取消</button>
                  <button className="history-clear-button" type="button" disabled={historyMaintenanceBusy} onClick={clearSelectedHistory}>确认清除</button>
                </div>
              </div>
            ) : null}
            {historyMessage ? <p className={`ai-message is-${historyMessageKind}`} role="status">{historyMessage}</p> : null}
          </section>
        </main>
      )}
      </div>
    </div>
  );
}

export default App;
