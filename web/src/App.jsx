import { useEffect, useMemo, useState } from "react";
import { collectLemmas } from "./domain/lemma.mjs";
import { collectCardImports } from "./domain/examples.mjs";
import {
  estimateInitialRemainingSeconds,
  remainingSecondsAt,
  updateEstimateDeadline,
} from "./domain/progressEstimate.mjs";
import MNBridge from "./lib/mnBridge";

const TOKEN_HELP_URL = "https://open.maimemo.com/#/";
const MAX_EXAMPLES_PER_IMPORT = 10;
const MAX_READING_WORDS = 30;

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
  { value: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { value: "siliconflow", label: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
  { value: "qwen", label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { value: "zhipu", label: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { value: "moonshot", label: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { value: "custom", label: "自定义服务商", baseUrl: "", model: "" },
];

function aiProviderDefinition(value) {
  return AI_PROVIDERS.find((provider) => provider.value === value) || AI_PROVIDERS[0];
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

function App() {
  const [token, setToken] = useState("");
  const [bookId, setBookId] = useState("");
  const [notepads, setNotepads] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [addWords, setAddWords] = useState(true);
  const [addExamples, setAddExamples] = useState(true);
  const [addStudy, setAddStudy] = useState(false);
  const [advanceStudy, setAdvanceStudy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [retryingHistoryId, setRetryingHistoryId] = useState("");
  const [activePage, setActivePage] = useState("import");
  const [aiProvider, setAiProvider] = useState("deepseek");
  const [aiProfiles, setAiProfiles] = useState({});
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.deepseek.com");
  const [aiModel, setAiModel] = useState("deepseek-v4-flash");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiMessageKind, setAiMessageKind] = useState("info");
  const [todayItems, setTodayItems] = useState([]);
  const [readingHistory, setReadingHistory] = useState([]);
  const [readingSelection, setReadingSelection] = useState([]);
  const [readingArticleType, setReadingArticleType] = useState("cet4");
  const [readingLength, setReadingLength] = useState("medium");
  const [readingTranslation, setReadingTranslation] = useState(true);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [readingLoading, setReadingLoading] = useState(false);
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingMessage, setReadingMessage] = useState("");
  const [readingMessageKind, setReadingMessageKind] = useState("info");
  const [estimateDeadline, setEstimateDeadline] = useState(0);
  const [progressClock, setProgressClock] = useState(Date.now());

  const hasImportContent = addWords || addExamples || addStudy;
  const needsBook = addWords;
  const canPreview = hasImportContent && token.trim() && (!needsBook || bookId.trim()) && !busy;
  const previewWords = preview ? preview.lemmas : [];
  const previewExamples = preview ? preview.examples || [] : [];
  const canConfirm = previewWords.length > 0 &&
    (addWords || addStudy || previewExamples.length > 0) &&
    canPreview;
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

  useEffect(() => {
    MNBridge.send("getSettings")
      .then((settings) => {
        setToken(settings.token || "");
        setBookId(settings.bookId || "");
      })
      .catch(() => setMessage("无法读取本机设置"));
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
  }, []);

  useEffect(() => {
    if (activePage === "reading") loadTodayReading(false);
  }, [activePage]);

  async function loadImportHistory(showMessage = true) {
    try {
      setHistoryLoading(true);
      const payload = await MNBridge.send("listImportHistory");
      setHistoryEntries(Array.isArray(payload.entries) ? payload.entries : []);
      if (showMessage) setMessage("导入历史已刷新");
    } catch (error) {
      if (showMessage) setMessage(error.message || "无法读取导入历史");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveSettings(nextBookId = bookId) {
    await MNBridge.send("saveSettings", { token, bookId: nextBookId });
  }

  function switchAiProvider(nextProvider) {
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
    setAiMessage("");
  }

  async function saveAiConfiguration() {
    try {
      setAiSaving(true);
      setAiMessage("");
      const currentDraft = aiProviderProfile(aiProvider, {
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel,
      });
      const profiles = { ...aiProfiles, [aiProvider]: currentDraft };
      await MNBridge.send("saveAiSettings", {
        provider: aiProvider,
        providers: profiles,
        ...currentDraft,
      });
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
    if (!aiApiKey.trim()) {
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
      setReadingMessage("请先在墨墨导入页面填写 Token");
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

  async function requestReadingArticle(words) {
    const selectedWords = Array.isArray(words) ? words : [];
    if (selectedWords.length === 0) {
      setReadingMessageKind("warning");
      setReadingMessage("没有待生成阅读内容的单词");
      return null;
    }
    if (!aiApiKey.trim()) {
      setReadingMessageKind("error");
      setReadingMessage(`请先在 AI 设置页面填写 ${aiProviderDefinition(aiProvider).label} API Key`);
      setActivePage("ai");
      return null;
    }
    try {
      setReadingBusy(true);
      setReadingMessage("");
      const payload = await MNBridge.send("generateTodayReading", {
        settings: {
          provider: aiProvider,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          model: aiModel,
        },
        words: selectedWords,
        articleType: readingArticleType,
        length: readingLength,
        includeTranslation: readingTranslation,
      });
      setCurrentArticle(payload);
      if (payload.historyEntry) {
        setReadingHistory((current) => [payload.historyEntry, ...current]);
      }
      setReadingSelection([]);
      setReadingMessageKind("success");
      setReadingMessage(`文章生成成功，本次使用 ${selectedWords.length} 个单词`);
      return payload;
    } catch (error) {
      setReadingMessageKind("error");
      setReadingMessage(error.message || "生成 AI 阅读文章失败");
      return null;
    } finally {
      setReadingBusy(false);
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

  async function copyReadingContent(includeTranslation) {
    if (!currentArticle?.article) return;
    const content = includeTranslation && currentArticle.translation
      ? `${currentArticle.article}\n\n${currentArticle.translation}`
      : currentArticle.article;
    try {
      await navigator.clipboard.writeText(content);
      setReadingMessageKind("success");
      setReadingMessage(includeTranslation ? "中英对照已复制" : "英文文章已复制");
    } catch (error) {
      setReadingMessageKind("error");
      setReadingMessage("无法复制文章");
    }
  }

  function openTokenHelp(event) {
    event.preventDefault();
    MNBridge.send("openExternalURL", { url: TOKEN_HELP_URL }).catch(() => {
      setMessage("无法打开墨墨开放平台，请手动访问 https://open.maimemo.com/#/");
    });
  }

  async function loadNotepads() {
    if (!token.trim()) {
      setMessage("请先填写墨墨开放 API Token");
      return;
    }

    try {
      setBusy(true);
      setMessage("");
      await saveSettings();
      const payload = await MNBridge.send("listMomoNotepads");
      setNotepads(payload.notepads || []);
      setMessage(`已加载 ${payload.notepads?.length || 0} 本云词本`);
    } catch (error) {
      setMessage(error.message || "加载云词本失败");
    } finally {
      setBusy(false);
    }
  }

  async function previewSelection() {
    try {
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
        setMessage(selectedViewCount === 0
          ? "MarginNote 未返回已选卡片，请保持卡片选中后再点击识别"
          : `已读取选中卡片，但未识别到可导入的单词原型。${sampleMessage}`);
      }
    } catch (error) {
      setMessage(error.message || "读取已选卡片失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
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
      if (importResult.historyError) setMessage(importResult.historyError);
      await loadImportHistory(false);
    } catch (error) {
      setMessage(error.message || "导入失败");
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
      setAddWords(entry.retry.wordCount > 0);
      setAddExamples(entry.retry.exampleCount > 0);
      setAddStudy(entry.retry.studyCount > 0);
      setAdvanceStudy(entry.retry.studyCount > 0 && entry.options?.advanceStudy === true);
      setMessage(retryResult.historyError || "失败项重试完成，结果已保存为新的历史记录");
      await loadImportHistory(false);
    } catch (error) {
      setMessage(error.message || "重试失败项失败");
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
      setMessage("失败单词已复制");
    } catch (error) {
      setMessage("无法复制失败单词");
    }
  }

  return (
    <div className="app-shell">
      <header className="app-heading">
        <div>
          <h1>MoMo Import</h1>
          <p className="eyebrow">MarginNote → 墨墨背单词</p>
        </div>
        <span className="status-dot" aria-label={busy ? "正在处理" : "就绪"} />
      </header>

      <nav className="page-tabs" aria-label="功能页面">
        <button
          className={`page-tab${activePage === "import" ? " is-active" : ""}`}
          type="button"
          onClick={() => setActivePage("import")}
        >
          墨墨导入
        </button>
        <button
          className={`page-tab${activePage === "reading" ? " is-active" : ""}`}
          type="button"
          onClick={() => setActivePage("reading")}
        >
          AI 阅读
        </button>
        <button
          className={`page-tab${activePage === "ai" ? " is-active" : ""}`}
          type="button"
          onClick={() => setActivePage("ai")}
        >
          AI 设置
        </button>
      </nav>

      {activePage === "import" ? (
      <main className="import-layout">
        <section className="settings-column" aria-label="导入设置">
          <div className="page-intro import-page-intro">
            <p className="eyebrow">墨墨词汇管理</p>
            <h2>墨墨导入</h2>
            <p>将脑图中选中的单词、例句和背诵计划同步到墨墨。</p>
          </div>
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
          <input
            id="momo-token"
            type="password"
            value={token}
            autoComplete="off"
            placeholder="粘贴 Token（可带 Bearer 前缀）"
            onChange={(event) => setToken(event.target.value)}
          />
          <fieldset className="mode-block">
            <legend className="field-label">导入内容</legend>
            <div className="import-options">
              <label className={`import-option${addWords ? " is-selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={addWords}
                  onChange={(event) => {
                    setAddWords(event.target.checked);
                    setResult(null);
                  }}
                />
                <span className="option-check" aria-hidden="true">✓</span>
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
                    setAddExamples(event.target.checked);
                    setResult(null);
                  }}
                />
                <span className="option-check" aria-hidden="true">✓</span>
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
                  }}
                />
                <span className="option-check" aria-hidden="true">✓</span>
                <span className="option-copy">
                  <strong>添加背诵</strong>
                  <small>加入墨墨背诵列表</small>
                </span>
              </label>
              {addExamples ? (
                <p className="option-guidance example-duration-note">
                  例句较多时会自动分批上传，所需时间通常比只添加单词更长。
                </p>
              ) : null}
              {addStudy ? (
                <p className="option-guidance study-limit-note">
                  添加背诵会占用墨墨账号的单词上限，达到上限后将无法继续添加。
                </p>
              ) : null}
              {addStudy ? (
                <div className="option-guidance study-advance-control">
                  <label className="study-advance-option">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={advanceStudy}
                      onChange={(event) => {
                        setAdvanceStudy(event.target.checked);
                        setResult(null);
                      }}
                    />
                    <span className="switch-track" aria-hidden="true">
                      <span className="switch-thumb" />
                    </span>
                    <span>已在背诵中则提前复习</span>
                  </label>
                  <details className="option-info">
                    <summary aria-label="查看提前复习说明" title="查看提前复习说明">i</summary>
                    <p>
                      <span className="option-info-line">需 10 级账号并开启墨墨自动同步</span>
                      <span className="option-info-line">开启后会调整当前学习计划。</span>
                    </p>
                  </details>
                </div>
              ) : null}
            </div>
            {!hasImportContent ? (
              <p className="selection-note selection-warning" role="alert">请至少选择一种导入内容。</p>
            ) : !addWords ? (
              <p className="selection-note">添加例句或背诵不需要选择目标云词本。</p>
            ) : null}
            {addStudy ? (
              <p className="selection-note">添加背诵使用墨墨公测接口，请先在墨墨 App 中开启自动同步。</p>
            ) : null}
          </fieldset>

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
                    saveSettings(nextBookId).catch(() => setMessage("保存目标云词本失败"));
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
                  onChange={(event) => setBookId(event.target.value)}
                />
              )}
            </div>
            <button className="secondary-button" type="button" disabled={busy || !needsBook} onClick={loadNotepads}>
              加载词本
            </button>
          </div>

          {selectedBook ? <p className="selection-note">目标：{selectedBook.title}</p> : null}
          <button className="primary-action" type="button" disabled={!canPreview} onClick={previewSelection}>
            识别已选卡片
          </button>
          {message ? <p className="message" role="status">{message}</p> : null}
        </section>

        <section className="preview-column" aria-label="导入预览">
          <div className="section-heading">
            <div>
              <p className="eyebrow">导入预览</p>
              <h2>{preview ? `${previewWords.length} 个单词原型` : "等待识别"}</h2>
            </div>
            {preview ? <span className="count-badge">已选 {preview.selectedCount} 张</span> : null}
          </div>

          {previewWords.length > 0 ? (
            <>
              <div className="word-list">
                {previewWords.map((word) => <span key={word}>{word}</span>)}
              </div>
              <div className="example-summary">
                <strong>{addExamples ? `${previewExamples.length} 条例句` : "不添加例句"}</strong>
                <span>
                  {!addExamples
                    ? "当前只会把单词添加到目标云词本"
                    : preview.cardsWithoutExamples?.length
                    ? `有 ${preview.cardsWithoutExamples.length} 张卡片未识别到完整例句`
                    : "将把英文句子和最后一行中文翻译上传到对应单词"}
                </span>
              </div>
              {addExamples && previewExamples.length > MAX_EXAMPLES_PER_IMPORT ? (
                <p className="queue-note">
                  将自动分成 {Math.ceil(previewExamples.length / MAX_EXAMPLES_PER_IMPORT)} 批上传，每批最多 {MAX_EXAMPLES_PER_IMPORT} 条；遇到限流或短暂网络错误会自动等待重试。
                </p>
              ) : null}
              {addExamples && preview.cardsWithoutExamples?.length ? (
                <details className="missing-example-details">
                  <summary>查看未识别完整例句的卡片</summary>
                  <ul>
                    {preview.cardsWithoutExamples.map((title, index) => (
                      <li key={`${title || "未读取到标题"}-${index}`}>
                        {title || "<未读取到标题>"}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {addExamples && previewExamples.length ? (
                <div className="example-list">
                  {previewExamples.slice(0, 8).map((example) => (
                    <div className="example-item" key={`${example.word}-${example.phrase}`}>
                      <strong>{example.word}</strong>
                      <span>{example.phrase}</span>
                      <small>{example.interpretation}</small>
                      <small>来源：{example.origin || "（空）"}</small>
                    </div>
                  ))}
                  <small>
                    {previewExamples.length > 8
                      ? `当前仅预览前 8 条，确认时将上传全部 ${previewExamples.length} 条例句`
                      : `确认时将上传全部 ${previewExamples.length} 条例句`}
                  </small>
                </div>
              ) : null}
              <div className="confirm-row">
                <p>{preview.skippedTitles.length
                  ? `已跳过 ${preview.skippedTitles.length} 张非单词卡片`
                  : `本次将添加：${selectedActionNames.join("、")}`}</p>
                <button className="primary-action" type="button" disabled={!canConfirm} onClick={confirmImport}>
                  {confirmActionLabel}
                </button>
              </div>
              {busy && importProgress?.totalBatches ? (
                <div className="queue-progress" role="status">
                  <div className="queue-progress-heading">
                    <strong>{importProgress.phase === "waiting"
                      ? `第 ${importProgress.batchIndex}/${importProgress.totalBatches} 批正在等待重试`
                      : importProgress.phase === "complete"
                        ? `例句 ${importProgress.totalBatches} 批已处理完成`
                        : importProgress.phase === "failed"
                          ? `第 ${importProgress.batchIndex}/${importProgress.totalBatches} 批处理失败`
                          : `正在处理第 ${importProgress.batchIndex}/${importProgress.totalBatches} 批`}</strong>
                    <span>{Math.min(importProgress.completedExamples || 0, importProgress.totalExamples || 0)}/{importProgress.totalExamples || 0} 条</span>
                  </div>
                  <progress
                    max={importProgress.totalExamples || 1}
                    value={Math.min(importProgress.completedExamples || 0, importProgress.totalExamples || 0)}
                  />
                  {importProgress.phase === "waiting" ? (
                    <small>
                      墨墨接口暂时不可用，将在约 {importProgress.waitSeconds || 0} 秒后自动重试
                      {importProgress.retryCount ? `（已重试 ${importProgress.retryCount} 次）` : ""}
                    </small>
                  ) : importProgress.phase === "failed" ? (
                    <small>{importProgress.reason || "该批次失败，后续批次未提交"}</small>
                  ) : null}
                  {progressEstimate && importProgress.phase !== "complete" && importProgress.phase !== "failed" ? (
                    <small>
                      预计剩余：{formatRemainingTime(progressEstimate.seconds)}
                      {importProgress.retryCount ? "（包含自动重试，时间可能延长）" : ""}
                    </small>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">在脑图中多选单词卡片后，识别结果会显示在这里。</div>
          )}

          {result && addWords ? (
            <div className="result-grid">
              <div><strong>{result.success?.length || 0}</strong><span>单词成功</span></div>
              <div><strong>{result.duplicate?.length || 0}</strong><span>单词已存在</span></div>
              <div><strong>{result.failed?.length || 0}</strong><span>单词失败</span></div>
              {result.failed?.length ? (
                <button className="secondary-button" type="button" onClick={copyFailedWords}>复制失败单词</button>
              ) : null}
            </div>
          ) : null}
          {result?.examples && addExamples ? (
            <>
              <p className="example-result">
                例句：成功 {result.examples.success?.length || 0} 条，已存在 {result.examples.duplicate?.length || 0} 条，失败 {result.examples.failed?.length || 0} 条
                {result.examples.error ? `（${result.examples.error}）` : ""}
              </p>
              {result.examples.failed?.[0]?.reason ? (
                <p className="example-result">首条失败原因：{result.examples.failed[0].reason}</p>
              ) : null}
              {result.examples.queue?.totalBatches ? (
                <p className="example-result">
                  批量任务：共 {result.examples.queue.totalBatches} 批
                  {result.examples.queue.retryCount ? `，自动重试 ${result.examples.queue.retryCount} 次` : "，未触发自动重试"}
                </p>
              ) : null}
            </>
          ) : null}
          {result?.study && addStudy ? (
            <>
              <p className="study-result">
                背诵：新增 {result.study.addedCount || 0} 个，未新增 {result.study.notAddedCount || 0} 个，未找到词条 {result.study.missing?.length || 0} 个
                {result.study.error ? `（${result.study.error}）` : ""}
              </p>
              {result.study.notAddedCount ? (
                <p className="study-result">未新增通常表示单词已在背诵列表中，或墨墨单词上限不足。</p>
              ) : null}
              {result.study.advanceRequested ? (
                <>
                  <p className="study-result">
                    提前复习：成功 {result.study.advancedCount || 0} 个，未提前 {result.study.notAdvancedCount || 0} 个
                  </p>
                  {result.study.advanceError ? (
                    <p className="study-result">未提前原因：{result.study.advanceError}</p>
                  ) : result.study.notAdvancedCount ? (
                    <p className="study-result">未提前通常表示单词尚未加入背诵列表、账号未达到 10 级，或墨墨公测接口未完成处理。</p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          <section className="history-section" aria-label="导入历史">
            <div className="history-heading">
              <div>
                <p className="eyebrow">导入历史</p>
                <h3>最近 {historyEntries.length} 次任务</h3>
              </div>
              <button
                className="history-refresh"
                type="button"
                disabled={busy || historyLoading}
                onClick={() => loadImportHistory(true)}
              >
                刷新
              </button>
            </div>
            <p className="history-privacy">历史保存在本机，不记录墨墨 Token；最多保留最近 20 次。</p>
            {historyEntries.length ? (
              <div className="history-list">
                {historyEntries.map((entry) => (
                  <details className="history-item" key={entry.id}>
                    <summary>
                      <span>
                        <strong>{entry.kind === "retry" ? "失败项重试" : "批量导入"}</strong>
                        <small>{formatHistoryTime(entry.createdAt)} · {historyOptions(entry)}</small>
                      </span>
                      <span className={entry.retry?.available ? "history-status has-failure" : "history-status"}>
                        {entry.retry?.available ? "有失败项" : "已完成"}
                      </span>
                    </summary>
                    <div className="history-details">
                      <p>
                        单词：成功 {entry.result?.words?.success?.length || 0}，已存在 {entry.result?.words?.duplicate?.length || 0}，失败 {entry.result?.words?.failed?.length || 0}
                      </p>
                      <p>
                        例句：成功 {entry.result?.examples?.success?.length || 0}，已存在 {entry.result?.examples?.duplicate?.length || 0}，失败 {entry.result?.examples?.failed?.length || 0}
                      </p>
                      {entry.options?.addStudy ? (
                        <p>
                          背诵：新增 {entry.result?.study?.addedCount || 0}，未新增 {entry.result?.study?.notAddedCount || 0}；提前复习成功 {entry.result?.study?.advancedCount || 0}，未提前 {entry.result?.study?.notAdvancedCount || 0}
                        </p>
                      ) : null}
                      {entry.result?.examples?.failed?.[0]?.reason ? (
                        <p className="history-error">例句失败原因：{entry.result.examples.failed[0].reason}</p>
                      ) : null}
                      {entry.result?.study?.error || entry.result?.study?.advanceError ? (
                        <p className="history-error">
                          背诵失败原因：{entry.result.study.error || entry.result.study.advanceError}
                        </p>
                      ) : null}
                      {entry.retry?.available ? (
                        <>
                          <p className="history-retry-summary">
                            可重试：单词 {entry.retry.wordCount || 0} 个、例句 {entry.retry.exampleCount || 0} 条、背诵 {entry.retry.studyCount || 0} 个
                          </p>
                          {entry.retry.studyCount ? (
                            <p className="history-limit-note">墨墨背诵接口只返回数量，无法指出具体失败单词，因此背诵会重新提交该次相关单词。</p>
                          ) : null}
                          <button
                            className="secondary-button history-retry-button"
                            type="button"
                            disabled={busy || !token.trim()}
                            onClick={() => retryHistory(entry)}
                          >
                            {retryingHistoryId === entry.id ? "正在重试…" : "仅重试失败项"}
                          </button>
                        </>
                      ) : (
                        <p className="history-retry-summary">没有需要重试的失败项。</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="history-empty">完成一次导入后，这里会保留结果和失败项。</div>
            )}
          </section>
        </section>
      </main>
      ) : activePage === "reading" ? (
        <main className="reading-layout" aria-label="AI 阅读">
          <section className="reading-card">
            <div className="reading-heading">
              <div>
                <p className="eyebrow">墨墨学习数据</p>
                <h2>AI 阅读</h2>
                <p>根据今日已背诵单词生成一篇适合当前词汇量的英语阅读文章。</p>
              </div>
            </div>

            <div className="reading-stat-grid">
              <div><strong>{todayItems.length}</strong><span>今日已背诵</span></div>
              <div><strong>{generatedTodayCount}</strong><span>已生成阅读</span></div>
              <div><strong>{pendingTodayCount}</strong><span>待生成阅读</span></div>
            </div>

            <div className="reading-controls">
              <div className="reading-control">
                <label className="field-label" htmlFor="reading-article-type">文章类型</label>
                <select id="reading-article-type" value={readingArticleType} onChange={(event) => setReadingArticleType(event.target.value)}>
                  {READING_ARTICLE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div className="reading-control">
                <label className="field-label" htmlFor="reading-length">文章长度</label>
                <select id="reading-length" value={readingLength} onChange={(event) => setReadingLength(event.target.value)}>
                  {READING_LENGTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <label className="reading-translation-option">
                <input
                  type="checkbox"
                  checked={readingTranslation}
                  onChange={(event) => setReadingTranslation(event.target.checked)}
                />
                <span>生成中文翻译</span>
              </label>
            </div>

            <div className="reading-selection-panel">
              <div className="reading-selection-heading">
                <div>
                  <p className="eyebrow">本次使用</p>
                  <strong>{readingSelection.length} 个单词</strong>
                </div>
                <span>每次最多自动选择 {MAX_READING_WORDS} 个未生成单词</span>
              </div>
              {readingSelection.length ? (
                <details className="reading-word-details">
                  <summary>查看本次使用的单词</summary>
                  <div className="reading-word-list">
                    {readingSelection.map((word) => <span key={`${word.id}-${word.spelling}`}>{word.spelling}</span>)}
                  </div>
                </details>
              ) : (
                <p className="reading-empty-note">
                  {todayItems.length === 0 ? "请先重新读取今日已背诵单词" : "今日已背诵单词均已有对应阅读"}
                </p>
              )}
            </div>

            <div className="reading-actions">
              <button
                className="secondary-button reading-action-button"
                type="button"
                disabled={readingLoading || readingBusy}
                onClick={() => loadTodayReading(true)}
              >
                {readingLoading ? "读取中…" : "重新读取"}
              </button>
              <button
                className="primary-action reading-action-button"
                type="button"
                disabled={readingBusy || readingLoading || readingSelection.length === 0}
                onClick={currentArticle ? generateNextReading : generateSelectedReading}
              >
                {readingBusy ? "生成中…" : currentArticle ? "生成下一篇" : "生成 AI 阅读"}
              </button>
            </div>
            {readingMessage ? <p className={`reading-message is-${readingMessageKind}`} role="status">{readingMessage}</p> : null}

            {currentArticle ? (
              <article className="reading-article">
                <div className="reading-article-heading">
                  <div>
                    <p className="eyebrow">本次 AI 阅读文章</p>
                    <h3>{readingArticleTypeLabel(currentArticle.articleType)}</h3>
                  </div>
                  <div className="reading-article-heading-actions">
                    <span>{currentArticle.words?.length || 0} 个单词</span>
                    <button className="secondary-button reading-action-button" type="button" disabled={readingBusy} onClick={regenerateReading}>
                      {readingBusy ? "生成中…" : "重新生成文章"}
                    </button>
                  </div>
                </div>
                <div className="reading-article-body">{currentArticle.article}</div>
                {currentArticle.translation ? (
                  <div className="reading-translation"><strong>中文翻译</strong><p>{currentArticle.translation}</p></div>
                ) : null}
                <div className="reading-copy-actions">
                  <button className="secondary-button" type="button" onClick={() => copyReadingContent(false)}>复制英文</button>
                  {currentArticle.translation ? (
                    <button className="secondary-button" type="button" onClick={() => copyReadingContent(true)}>复制中英对照</button>
                  ) : null}
                </div>
              </article>
            ) : null}
          </section>

          <section className="reading-history-card" aria-label="阅读历史">
            <div className="history-heading">
              <div>
                <p className="eyebrow">本机记录</p>
                <h3>阅读历史</h3>
              </div>
              <span className="count-badge">{readingHistory.length} 篇</span>
            </div>
            <p className="history-privacy">只保存文章、日期和单词 ID，不保存墨墨 Token 或各 AI 服务商 API Key。</p>
            {readingHistory.length ? (
              <div className="reading-history-list">
                {readingHistory.slice(0, 8).map((entry) => (
                  <details className="reading-history-item" key={entry.id}>
                    <summary>
                      <span>
                        <strong>{readingArticleTypeLabel(entry.articleType)}</strong>
                        <small>{formatHistoryTime(entry.createdAt)} · {entry.words?.length || 0} 个单词</small>
                      </span>
                      <span className="history-status">已生成</span>
                    </summary>
                    <div className="reading-history-content">
                      <p>{entry.article}</p>
                      {entry.translation ? <small>{entry.translation}</small> : null}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="history-empty">生成文章后，这里会保存阅读历史。</div>
            )}
          </section>
        </main>
      ) : (
        <main className="ai-settings-layout" aria-label="AI 设置">
          <section className="ai-settings-card">
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
                  value={aiProvider}
                  onChange={(event) => switchAiProvider(event.target.value)}
                >
                  {AI_PROVIDERS.map((provider) => (
                    <option key={provider.value} value={provider.value}>{provider.label}</option>
                  ))}
                </select>
                <p className="field-hint">切换服务商会自动带入对应 API 地址和推荐模型。</p>
              </div>

              <div className="ai-field">
                <label className="field-label" htmlFor="ai-api-key">{aiProviderDefinition(aiProvider).label} API Key</label>
                <div className="secret-input-row">
                  <input
                    id="ai-api-key"
                    type={showAiKey ? "text" : "password"}
                    value={aiApiKey}
                    autoComplete="off"
                    placeholder={`粘贴 ${aiProviderDefinition(aiProvider).label} API Key`}
                    onChange={(event) => setAiApiKey(event.target.value)}
                  />
                  <button
                    className="field-action"
                    type="button"
                    aria-label={showAiKey ? "隐藏 API Key" : "显示 API Key"}
                    onClick={() => setShowAiKey((current) => !current)}
                  >
                    {showAiKey ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>

              <div className="ai-field">
                <label className="field-label" htmlFor="ai-base-url">API 地址</label>
                <input
                  id="ai-base-url"
                  type="url"
                  value={aiBaseUrl}
                  placeholder={aiProviderDefinition(aiProvider).baseUrl || "https://example.com/v1"}
                  onChange={(event) => setAiBaseUrl(event.target.value)}
                />
                <p className="field-hint">已自动填入默认地址，也可以改为兼容 OpenAI 格式的代理地址。</p>
              </div>

              <div className="ai-field">
                <label className="field-label" htmlFor="ai-model">模型</label>
                <input
                  id="ai-model"
                  value={aiModel}
                  placeholder={aiProviderDefinition(aiProvider).model || "填写服务商模型名称"}
                  onChange={(event) => setAiModel(event.target.value)}
                />
              </div>
            </div>

            <div className="ai-actions">
              <button className="secondary-button" type="button" disabled={aiTesting || aiSaving} onClick={testAiConnection}>
                {aiTesting ? "测试中…" : "测试连接"}
              </button>
              <button className="primary-action" type="button" disabled={aiSaving || aiTesting} onClick={saveAiConfiguration}>
                {aiSaving ? "保存中…" : "保存设置"}
              </button>
            </div>

            {aiMessage ? (
              <p className={`ai-message is-${aiMessageKind}`} role="status">{aiMessage}</p>
            ) : null}
            <p className="ai-privacy-note">各服务商 API Key 仅保存在本机，用于生成 AI 阅读文章，不会发送给墨墨或写入导入历史。</p>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
