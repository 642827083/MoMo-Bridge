import { useEffect, useMemo, useState } from "react";
import { collectLemmas } from "./domain/lemma.mjs";
import MNBridge from "./lib/mnBridge";

function App() {
  const [token, setToken] = useState("");
  const [bookId, setBookId] = useState("");
  const [notepads, setNotepads] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const canPreview = token.trim() && bookId.trim() && !busy;
  const previewWords = preview ? preview.lemmas : [];
  const canConfirm = previewWords.length > 0 && canPreview;
  const selectedBook = useMemo(
    () => notepads.find((notepad) => notepad.id === bookId),
    [bookId, notepads],
  );

  useEffect(() => {
    MNBridge.send("getSettings")
      .then((settings) => {
        setToken(settings.token || "");
        setBookId(settings.bookId || "");
      })
      .catch(() => setMessage("无法读取本机设置"));
  }, []);

  async function saveSettings(nextBookId = bookId) {
    await MNBridge.send("saveSettings", { token, bookId: nextBookId });
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
      await saveSettings();
      const payload = await MNBridge.send("getSelectedTitles");
      const parsed = collectLemmas(payload.titles || []);
      setPreview({ ...parsed, selectedCount: payload.titles?.length || 0 });
      if (parsed.lemmas.length === 0) {
        setMessage("未从已选卡片中识别到可导入的单词原型");
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
      const importResult = await MNBridge.send("importMomoWords", { words: previewWords });
      setResult(importResult);
    } catch (error) {
      setMessage(error.message || "导入失败");
    } finally {
      setBusy(false);
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
      <header className="app-header app-heading">
        <div>
          <p className="eyebrow">MarginNote → 墨墨背单词</p>
          <h1>单词书导入</h1>
        </div>
        <span className="status-dot" aria-label={busy ? "正在处理" : "就绪"} />
      </header>

      <main className="import-layout">
        <section className="settings-column" aria-label="导入设置">
          <label className="field-label" htmlFor="momo-token">墨墨 Token</label>
          <a
            className="token-help"
            href="https://accounts.maimemo.com/interaction/gPKHilg7fXNmsi2OrZK8IbH4AV6l7bZKRZTU4Aowmii"
            target="_blank"
            rel="noreferrer"
          >
            如何获取墨墨 Token
          </a>
          <input
            id="momo-token"
            type="password"
            value={token}
            autoComplete="off"
            placeholder="Bearer Token"
            onChange={(event) => setToken(event.target.value)}
          />

          <div className="book-row">
            <div className="field-block">
              <label className="field-label" htmlFor="momo-book">目标云词本</label>
              {notepads.length > 0 ? (
                <select
                  id="momo-book"
                  value={bookId}
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
                  placeholder="云词本 ID"
                  onChange={(event) => setBookId(event.target.value)}
                />
              )}
            </div>
            <button className="secondary-button" type="button" disabled={busy} onClick={loadNotepads}>
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
              <div className="confirm-row">
                <p>{preview.skippedTitles.length ? `已跳过 ${preview.skippedTitles.length} 张非单词卡片` : "标题中的词形已自动归并为原型"}</p>
                <button className="primary-action" type="button" disabled={!canConfirm} onClick={confirmImport}>
                  确认导入
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">在脑图中多选单词卡片后，识别结果会显示在这里。</div>
          )}

          {result ? (
            <div className="result-grid">
              <div><strong>{result.success?.length || 0}</strong><span>成功</span></div>
              <div><strong>{result.duplicate?.length || 0}</strong><span>已存在</span></div>
              <div><strong>{result.failed?.length || 0}</strong><span>失败</span></div>
              {result.failed?.length ? (
                <button className="secondary-button" type="button" onClick={copyFailedWords}>复制失败单词</button>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default App;
