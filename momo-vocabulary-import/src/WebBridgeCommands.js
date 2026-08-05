var __MN_WEB_BRIDGE_COMMANDS_GLOBAL__ = (function () {
  const TOKEN_KEY = "cn.marginnote.momo-vocabulary-import.token";
  const BOOK_ID_KEY = "cn.marginnote.momo-vocabulary-import.book-id";

  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function ping(context, payload) {
    return {
      now: new Date().toISOString(),
      source: "mn-addon",
      payload: toBridgePayload(payload),
      addon: context.addon && context.addon.window ? "available" : "unavailable",
    };
  }

  function echo(context, payload) {
    return {
      echoed: toBridgePayload(payload),
    };
  }

  function closePanel(context, payload) {
    context.closePanel(context.controller);
    return {
      closed: true,
      payload: toBridgePayload(payload),
    };
  }

  function openExternalURL(context, payload) {
    const urlString = payload && typeof payload.url === "string" ? payload.url.trim() : "";
    if (!urlString || !urlString.startsWith("https://open.maimemo.com/")) {
      throw new Error("只允许打开墨墨开放平台地址");
    }

    const url = NSURL.URLWithString(urlString);
    if (!url) throw new Error("墨墨开放平台地址无效");
    UIApplication.sharedApplication().openURL(url);
    return { opened: true };
  }

  function savedToken() {
    return NSUserDefaults.standardUserDefaults().objectForKey(TOKEN_KEY) || "";
  }

  function savedBookId() {
    return NSUserDefaults.standardUserDefaults().objectForKey(BOOK_ID_KEY) || "";
  }

  function getSettings() {
    return {
      token: savedToken(),
      bookId: savedBookId(),
    };
  }

  function saveSettings(context, payload) {
    const token = payload && typeof payload.token === "string" ? payload.token.trim() : "";
    const bookId = payload && typeof payload.bookId === "string" ? payload.bookId.trim() : "";
    const defaults = NSUserDefaults.standardUserDefaults();
    defaults.setObjectForKey(token, TOKEN_KEY);
    defaults.setObjectForKey(bookId, BOOK_ID_KEY);
    return { saved: true, tokenConfigured: !!token, bookId };
  }

  function getSelectedTitles(context) {
    if (!context.addon || !context.addon.window) {
      throw new Error("当前未连接到 MarginNote 学习窗口");
    }
    const titles = __MN_MOMO_SELECTION_GLOBAL__.selectedTitles(context.addon.window);
    return {
      titles,
      debug: __MN_MOMO_SELECTION_GLOBAL__.selectionDebug(),
    };
  }

  function listMomoNotepads() {
    return __MN_MOMO_API_GLOBAL__.listNotepads(savedToken()).then(function (notepads) {
      return { notepads };
    });
  }

  function importMomoWords(context, payload) {
    const words = payload && Array.isArray(payload.words) ? payload.words : [];
    const bookId = savedBookId();
    if (!bookId) throw new Error("请先选择目标云词本");
    if (words.length === 0) throw new Error("没有可导入的单词");
    if (words.length > 1000) throw new Error("一次最多导入 1000 个单词");

    return __MN_MOMO_API_GLOBAL__.importWords(savedToken(), bookId, words);
  }

  const commands = {
    ping,
    echo,
    closePanel,
    openExternalURL,
    getSettings,
    saveSettings,
    getSelectedTitles,
    listMomoNotepads,
    importMomoWords,
  };

  return {
    commands,
  };
})();
