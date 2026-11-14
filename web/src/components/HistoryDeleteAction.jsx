import { useState } from "react";

export default function HistoryDeleteAction({ disabled, deleting, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="history-delete-action">
      {confirming ? (
        <>
          <p>删除后将无法从此记录重试失败项。</p>
          <button className="secondary-button" type="button" disabled={deleting} onClick={() => setConfirming(false)}>取消</button>
          <button className="history-delete-button" type="button" disabled={disabled} onClick={onDelete}>{deleting ? "删除中…" : "确认删除"}</button>
        </>
      ) : (
        <button className="history-delete-button" type="button" disabled={disabled} onClick={() => setConfirming(true)}>删除这条记录</button>
      )}
    </div>
  );
}
