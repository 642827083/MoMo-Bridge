import { importHistorySummary, importResultHasFailures } from "../domain/importPresentation.mjs";
import RefreshIcon from "./RefreshIcon";

function ImportEmptyState({ history = false }) {
  return (
    <div className="import-empty-card">
      <span className="import-empty-icon" aria-hidden="true">{history ? "↺" : "+"}</span>
      <strong>{history ? "还没有导入记录" : "还没有识别单词"}</strong>
      <p>{history ? "完成一次导入后，这里会保留结果和失败项。" : "在脑图中多选单词卡片后，点击“识别已选卡片”，内容会显示在这里。"}</p>
    </div>
  );
}

function ImportTaskResults({ result, options }) {
  const rows = [
    options.addWords ? { label: "单词", data: result.words } : null,
    options.addExamples ? { label: "例句", data: result.examples } : null,
  ].filter(Boolean);
  return (
    <>
      {rows.length ? (
        <div className="import-task-group">
          <table className="import-results-table" aria-label="导入结果">
            <thead><tr><th scope="col">导入内容</th><th scope="col">成功</th><th scope="col">已存在</th><th scope="col">失败</th></tr></thead>
            <tbody>{rows.map(({ label, data }) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="is-success">{data?.success?.length || 0}</td>
                <td>{data?.duplicate?.length || 0}</td>
                <td className={data?.failed?.length ? "is-failure" : undefined}>{data?.failed?.length || 0}</td>
              </tr>
            ))}</tbody>
          </table>
          {options.addExamples && (result.examples?.error || result.examples?.failed?.[0]?.reason) ? (
            <p className="import-task-error">例句失败原因：{result.examples.error || result.examples.failed[0].reason}</p>
          ) : null}
          {options.addExamples && result.examples?.queue?.totalBatches ? (
            <p className="import-task-note">批量任务：共 {result.examples.queue.totalBatches} 批{result.examples.queue.retryCount ? `，自动重试 ${result.examples.queue.retryCount} 次` : "，未触发自动重试"}</p>
          ) : null}
        </div>
      ) : null}
      {options.addStudy && result.study ? (
        <div className="import-task-group">
          <div className="import-task-group-heading"><strong>背诵</strong><span>新增 {result.study.addedCount || 0} 个</span></div>
          <p className="import-task-note">背诵：新增 {result.study.addedCount || 0} 个，未新增 {result.study.notAddedCount || 0} 个，未找到词条 {result.study.missing?.length || 0} 个</p>
          {result.study.notAddedCount ? <p className="import-task-note">未新增通常表示单词已在背诵列表中，或墨墨单词上限不足。</p> : null}
          {result.study.error ? <p className="import-task-error">背诵失败原因：{result.study.error}</p> : null}
          {result.study.advanceRequested ? (
            <>
              <p className="import-task-note">提前复习：成功 {result.study.advancedCount || 0} 个，未提前 {result.study.notAdvancedCount || 0} 个</p>
              {result.study.advanceError ? <p className="import-task-error">未提前原因：{result.study.advanceError}</p>
                : result.study.notAdvancedCount ? <p className="import-task-note">未提前通常表示单词尚未加入背诵列表、账号未达到 10 级，或墨墨公测接口未完成处理。</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function ImportPreviewPanel({ preview, previewWords, previewExamples, addWords, addExamples, addStudy, advanceStudy,
  selectedActionNames, canConfirm, confirmActionLabel, confirmImport, busy, importProgress, progressEstimate,
  formatRemainingTime, maxExamplesPerImport, result, copyFailedWords }) {
  const completedOptions = result?.history?.options || { addWords, addExamples, addStudy, advanceStudy };
  const hasFailures = importResultHasFailures(result, completedOptions);
  return (
    <div className="import-view-panel" id="import-preview-panel" role="tabpanel" aria-labelledby="import-preview-tab">
      <div className="import-panel-heading">
        <h2>{result ? (hasFailures ? "导入已结束" : "导入已完成") : previewWords.length ? `待导入 · ${previewWords.length} 个单词` : "等待识别"}</h2>
        {preview && !result ? <span className="count-badge">已选 {preview.selectedCount} 张</span> : null}
      </div>
      <p className="import-panel-note">{result
        ? hasFailures ? "本次任务已结束，失败项可在导入历史中查看并重试。" : "本次任务已完成；导入新内容请重新识别卡片。"
        : "识别后确认单词、例句和背诵内容，再提交导入。"}</p>
      {previewWords.length && !result ? (
        <section className="import-task-card" aria-label="本次导入">
          <div className="import-task-heading">
            <div><h3>本次导入</h3><p>{selectedActionNames.join(" · ") || "请选择导入内容"}</p></div>
            <span className="history-status">{busy ? "处理中" : "待确认"}</span>
          </div>
          <div className="import-task-body">
            <div className="import-task-group">
              <div className="import-task-group-heading"><strong>单词</strong><span>{previewWords.length} 个原型</span></div>
              <div className="word-list">{previewWords.map((word) => <span key={word}>{word}</span>)}</div>
              {!addWords ? <p className="import-task-note">不写入云词本，仅用于{[addExamples ? "添加例句" : "", addStudy ? "加入背诵" : ""].filter(Boolean).join("、") || "预览"}。</p> : null}
            </div>
            {addExamples ? (
              <div className="import-task-group">
                <div className="import-task-group-heading"><strong>例句</strong><span>{previewExamples.length} 条完整例句</span></div>
                <p className="import-task-note">{preview.cardsWithoutExamples?.length
                  ? `有 ${preview.cardsWithoutExamples.length} 张卡片未识别到完整例句，不影响单词导入。`
                  : "将把英文句子和最后一行中文翻译上传到对应单词"}</p>
                {previewExamples.length > maxExamplesPerImport ? (
                  <p className="queue-note">将自动分成 {Math.ceil(previewExamples.length / maxExamplesPerImport)} 批上传，每批最多 {maxExamplesPerImport} 条；遇到限流或短暂网络错误会自动等待重试。</p>
                ) : null}
                {preview.cardsWithoutExamples?.length ? (
                  <details className="missing-example-details">
                    <summary>查看未识别完整例句的卡片</summary>
                    <ul>{preview.cardsWithoutExamples.map((title, index) => <li key={`${title || "未读取到标题"}-${index}`}>{title || "<未读取到标题>"}</li>)}</ul>
                  </details>
                ) : null}
                {previewExamples.length ? (
                  <details className="import-example-details">
                    <summary>查看例句预览</summary>
                    <div className="example-list">
                      {previewExamples.slice(0, 8).map((example) => (
                        <div className="example-item" key={`${example.word}-${example.phrase}`}>
                          <strong>{example.word}</strong><span>{example.phrase}</span><small>{example.interpretation}</small><small>来源：{example.origin || "（空）"}</small>
                        </div>
                      ))}
                      <small>{previewExamples.length > 8 ? `当前仅预览前 8 条，确认时将上传全部 ${previewExamples.length} 条例句` : `确认时将上传全部 ${previewExamples.length} 条例句`}</small>
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}
            {addStudy ? (
              <div className="import-task-group">
                <div className="import-task-group-heading"><strong>背诵</strong><span>{previewWords.length} 个单词</span></div>
                <div className="import-task-tags"><span>加入背诵列表</span>{advanceStudy ? <span>提前复习已开启</span> : null}</div>
              </div>
            ) : null}
            <div className="confirm-row import-task-actions">
              <p>{preview.skippedTitles.length ? `已跳过 ${preview.skippedTitles.length} 张非单词卡片` : `本次将添加：${selectedActionNames.join("、")}`}</p>
              <button className="primary-action" type="button" disabled={!canConfirm} onClick={confirmImport}>{confirmActionLabel}</button>
            </div>
            {busy && importProgress?.totalBatches ? (
              <div className="queue-progress" role="status">
                <div className="queue-progress-heading">
                  <strong>{importProgress.phase === "waiting" ? `第 ${importProgress.batchIndex}/${importProgress.totalBatches} 批正在等待重试`
                    : importProgress.phase === "complete" ? `例句 ${importProgress.totalBatches} 批已处理完成`
                    : importProgress.phase === "failed" ? `第 ${importProgress.batchIndex}/${importProgress.totalBatches} 批处理失败`
                    : `正在处理第 ${importProgress.batchIndex}/${importProgress.totalBatches} 批`}</strong>
                  <span>{Math.min(importProgress.completedExamples || 0, importProgress.totalExamples || 0)}/{importProgress.totalExamples || 0} 条</span>
                </div>
                <progress max={importProgress.totalExamples || 1} value={Math.min(importProgress.completedExamples || 0, importProgress.totalExamples || 0)} />
                {importProgress.phase === "waiting" ? <small>墨墨接口暂时不可用，将在约 {importProgress.waitSeconds || 0} 秒后自动重试{importProgress.retryCount ? `（已重试 ${importProgress.retryCount} 次）` : ""}</small>
                  : importProgress.phase === "failed" ? <small>{importProgress.reason || "该批次失败，后续批次未提交"}</small> : null}
                {progressEstimate && importProgress.phase !== "complete" && importProgress.phase !== "failed" ? <small>预计剩余：{formatRemainingTime(progressEstimate.seconds)}{importProgress.retryCount ? "（包含自动重试，时间可能延长）" : ""}</small> : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : !result ? <ImportEmptyState /> : null}
      {result ? (
        <section className="import-task-card import-current-result" aria-label="本次导入结果">
          <div className="import-task-heading">
            <div><h3>{result.history?.kind === "retry" ? "失败项重试结果" : "本次导入结果"}</h3><p>单词、例句和背诵的处理情况</p></div>
            <span className={hasFailures ? "history-status has-failure" : "history-status"}>{hasFailures ? "有失败项" : "已完成"}</span>
          </div>
          <div className="import-task-body">
            <ImportTaskResults result={{ ...result, words: result }} options={completedOptions} />
            {completedOptions.addWords && result.failed?.length ? <div className="import-task-actions"><button className="secondary-button" type="button" onClick={copyFailedWords}>复制失败单词</button></div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function ImportHistoryPanel({ historyEntries, busy, historyLoading, loadImportHistory, formatHistoryTime, historyOptions, tokenConfigured, retryingHistoryId, retryHistory }) {
  return (
    <div className="import-view-panel" id="import-history-panel" role="tabpanel" aria-labelledby="import-history-tab">
      <section aria-label="导入历史">
        <div className="import-panel-heading">
          <h2>最近 {historyEntries.length} 次任务</h2>
          <button className="history-refresh import-history-refresh" type="button" aria-label={historyLoading ? "正在刷新导入历史" : "刷新导入历史"} title="刷新导入历史" disabled={busy || historyLoading} onClick={() => loadImportHistory(true)}>
            <RefreshIcon />
          </button>
        </div>
        <p className="import-panel-note">历史保存在本机，不记录墨墨 Token；最多保留最近 10 次。</p>
        {historyEntries.length ? (
          <div className="import-task-list">
            {historyEntries.map((entry) => (
              <details className="import-task-card import-history-task" key={entry.id}>
                <summary className="import-task-heading">
                  <span><strong>{entry.kind === "retry" ? "失败项重试" : "批量导入"}</strong><small>{formatHistoryTime(entry.createdAt)} · {importHistorySummary(entry) || historyOptions(entry)}</small></span>
                  <span className="import-task-status"><span className={entry.retry?.available ? "history-status has-failure" : "history-status"}>{entry.retry?.available ? "有失败项" : "已完成"}</span><span className="import-task-chevron" aria-hidden="true">›</span></span>
                </summary>
                <div className="import-task-body">
                  <ImportTaskResults result={entry.result || {}} options={entry.options || {}} />
                  {entry.retry?.studyCount ? <p className="import-task-note">墨墨背诵接口只返回数量，无法指出具体失败单词，因此背诵会重新提交该次相关单词。</p> : null}
                  <div className="import-task-actions">
                    <p>{entry.retry?.available ? `可重试：单词 ${entry.retry.wordCount || 0} 个、例句 ${entry.retry.exampleCount || 0} 条、背诵 ${entry.retry.studyCount || 0} 个` : "没有需要重试的失败项。"}</p>
                    {entry.retry?.available ? (
                      <button className="secondary-button" type="button" disabled={busy || !tokenConfigured} onClick={() => retryHistory(entry)}>{retryingHistoryId === entry.id ? "正在重试…" : "仅重试失败项"}</button>
                    ) : null}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : <ImportEmptyState history />}
      </section>
    </div>
  );
}
