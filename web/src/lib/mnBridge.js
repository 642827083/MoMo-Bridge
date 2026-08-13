const BRIDGE_SCHEME = "mnaddon://bridge?payload=";

function nextRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureBridgeReceiver() {
  if (typeof window.__MNBridgePending !== "object") {
    window.__MNBridgePending = {};
  }

  if (typeof window.__MN_WEB_BRIDGE_RECEIVE_FN__ === "function") {
    if (typeof window.__MN_WEB_BRIDGE_PROGRESS_FN__ === "function") return;
  }

  window.__MN_WEB_BRIDGE_RECEIVE_FN__ = (raw) => {
    const response = JSON.parse(raw);
    const pending = window.__MNBridgePending[response.requestId];
    if (!pending) {
      return;
    }

    delete window.__MNBridgePending[response.requestId];

    if (response.error) {
      pending.reject(response.error);
      return;
    }

    pending.resolve(response.payload);
  };

  window.__MN_WEB_BRIDGE_PROGRESS_FN__ = (raw) => {
    const progress = JSON.parse(raw);
    const pending = window.__MNBridgePending[progress.requestId];
    if (pending && typeof pending.onProgress === "function") {
      pending.onProgress(progress.payload);
    }
  };
}

function send(command, payload = null, options = {}) {
  ensureBridgeReceiver();

  const requestId = nextRequestId();
  const message = {
    command,
    requestId,
    payload,
    error: null,
  };

  return new Promise((resolve, reject) => {
    window.__MNBridgePending[requestId] = {
      resolve(result) {
        resolve(result);
      },
      reject(error) {
        reject(error);
      },
      onProgress: typeof options.onProgress === "function" ? options.onProgress : null,
    };

    const encoded = encodeURIComponent(JSON.stringify(message));
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `${BRIDGE_SCHEME}${encoded}`;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (error) {
        // 空操作。
      }
    }, 600);
  });
}

const MNBridge = {
  send,
};

export default MNBridge;
