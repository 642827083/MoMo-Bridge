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
  const [connectionTesting, setConnectionTesting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
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
    loadImportHistory(false);
  }, []);

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

  async function testConnection() {
    if (!token.trim()) {
      setConnectionMessage("请先填写墨墨开放 API Token");
      return;
    }
    try {
      setConnectionTesting(true);
      setConnectionMessage("");
      const payload = await MNBridge.send("testMomoConnection", { token });
      setConnectionMessage(payload.message || (payload.canReadNotepads ? "连接成功" : "连接失败"));
    } catch (error) {
      setConnectionMessage(error.message || "测试连接失败");
    } finally {
      setConnectionTesting(false);
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
      setConnectionMessage("");
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
        <p className="eyebrow">MarginNote → 墨墨背单词</p>
        <span className="status-dot" aria-label={busy ? "正在处理" : "就绪"} />
      </header>

      <main className="import-layout">
        <section className="settings-column" aria-label="导入设置">
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
          <button className="secondary-button connection-button" type="button" disabled={busy || connectionTesting} onClick={testConnection}>
            {connectionTesting ? "测试中…" : "测试连接"}
          </button>
          {connectionMessage ? <p className="selection-note" role="status">{connectionMessage}</p> : null}

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
                    <p>需 10 级账号并开启墨墨自动同步；开启后会调整当前学习计划。</p>
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
    </div>
  );
}

export default App;
