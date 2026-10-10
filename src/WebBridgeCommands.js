var __MN_WEB_BRIDGE_COMMANDS_GLOBAL__ = (function () {
  const TOKEN_KEY = "cn.marginnote.momo-vocabulary-import.token";
  const BOOK_ID_KEY = "cn.marginnote.momo-vocabulary-import.book-id";
  const AI_API_KEY_KEY = "cn.marginnote.momo-vocabulary-import.deepseek-api-key";
  const AI_BASE_URL_KEY = "cn.marginnote.momo-vocabulary-import.deepseek-base-url";
  const AI_MODEL_KEY = "cn.marginnote.momo-vocabulary-import.deepseek-model";
  const AI_PROVIDER_KEY = "cn.marginnote.momo-vocabulary-import.ai-provider";
  const AI_PROFILES_KEY = "cn.marginnote.momo-vocabulary-import.ai-provider-profiles";
  const UI_SETTINGS_KEY = "cn.marginnote.momo-vocabulary-import.ui-settings";
  let importHistoryRevision = 0;
  let readingHistoryRevision = 0;

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

  function saveMomoToken(context, payload) {
    if (!payload || typeof payload.token !== "string") {
      throw new Error("墨墨 Token 必须是文本");
    }
    const token = payload.token.trim();
    NSUserDefaults.standardUserDefaults().setObjectForKey(token, TOKEN_KEY);
    return { saved: true, tokenConfigured: !!token };
  }

  function clipboardText(label) {
    if (typeof MNUtil === "undefined" || !MNUtil || !("clipboardText" in MNUtil)) {
      throw new Error("请安装并启用 MN Utils 后使用粘贴按钮，也可长按输入框粘贴");
    }
    // 仅在用户点击粘贴时读取文本，不保存剪贴板内容。
    const text = MNUtil.clipboardText;
    if (text === undefined || text === null || !String(text).trim()) {
      throw new Error(`剪贴板没有文本，请先复制${label}`);
    }
    return { text: String(text).trim() };
  }

  function getMomoTokenClipboard() { return clipboardText("墨墨 Token"); }
  function getAiKeyClipboard() { return clipboardText(" API Key"); }

  function safeUiSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const importOptions = source.importOptions && typeof source.importOptions === "object"
      ? source.importOptions
      : {};
    const readingOptions = source.readingOptions && typeof source.readingOptions === "object"
      ? source.readingOptions
      : {};
    return {
      importOptions: {
        addWords: importOptions.addWords !== false,
        addExamples: importOptions.addExamples === true,
        addStudy: importOptions.addStudy === true,
        advanceStudy: importOptions.addStudy === true && importOptions.advanceStudy === true,
      },
      readingOptions: {
        articleType: typeof readingOptions.articleType === "string" ? readingOptions.articleType : "postgraduate2",
        length: typeof readingOptions.length === "string" ? readingOptions.length : "medium",
        translation: readingOptions.translation !== false,
        questions: readingOptions.questions === true,
      },
    };
  }

  function savedUiSettings() {
    const raw = NSUserDefaults.standardUserDefaults().objectForKey(UI_SETTINGS_KEY);
    if (!raw) return safeUiSettings({});
    try {
      return safeUiSettings(typeof raw === "string" ? JSON.parse(raw) : raw);
    } catch (ignored) {
      return safeUiSettings({});
    }
  }

  function getSettings() {
    const uiSettings = savedUiSettings();
    return {
      token: savedToken(),
      bookId: savedBookId(),
      importOptions: uiSettings.importOptions,
      readingOptions: uiSettings.readingOptions,
    };
  }

  function saveSettings(context, payload) {
    const token = payload && typeof payload.token === "string" ? payload.token.trim() : savedToken();
    const bookId = payload && typeof payload.bookId === "string" ? payload.bookId.trim() : "";
    const defaults = NSUserDefaults.standardUserDefaults();
    // 普通偏好设置更新不重写 Token，兼容旧页面显式传入的凭证。
    if (payload && typeof payload.token === "string") {
      defaults.setObjectForKey(token, TOKEN_KEY);
    }
    defaults.setObjectForKey(bookId, BOOK_ID_KEY);
    if (payload && (payload.importOptions || payload.readingOptions)) {
      const current = savedUiSettings();
      const next = safeUiSettings({
        importOptions: Object.assign({}, current.importOptions, payload.importOptions || {}),
        readingOptions: Object.assign({}, current.readingOptions, payload.readingOptions || {}),
      });
      defaults.setObjectForKey(JSON.stringify(next), UI_SETTINGS_KEY);
      return {
        saved: true,
        tokenConfigured: !!token,
        bookId,
        importOptions: next.importOptions,
        readingOptions: next.readingOptions,
      };
    }
    return { saved: true, tokenConfigured: !!token, bookId };
  }

  function readAiProfiles() {
    const defaults = NSUserDefaults.standardUserDefaults();
    const raw = defaults.objectForKey(AI_PROFILES_KEY);
    if (!raw) return {};
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (ignored) {
      return {};
    }
  }

  function safeAiProfile(provider, value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = __MN_DEEPSEEK_API_GLOBAL__.providerDefinition(provider);
    return {
      apiKey: typeof source.apiKey === "string" ? source.apiKey : "",
      baseUrl: typeof source.baseUrl === "string" ? source.baseUrl : defaults.baseUrl,
      model: typeof source.model === "string" ? source.model : defaults.model,
    };
  }

  function savedAiSettings() {
    const defaults = NSUserDefaults.standardUserDefaults();
    const provider = typeof defaults.objectForKey(AI_PROVIDER_KEY) === "string"
      ? defaults.objectForKey(AI_PROVIDER_KEY)
      : __MN_DEEPSEEK_API_GLOBAL__.DEFAULT_PROVIDER;
    const profiles = readAiProfiles();
    const legacyDeepSeek = {
      apiKey: defaults.objectForKey(AI_API_KEY_KEY) || "",
      baseUrl: defaults.objectForKey(AI_BASE_URL_KEY) || __MN_DEEPSEEK_API_GLOBAL__.DEFAULT_BASE_URL,
      model: defaults.objectForKey(AI_MODEL_KEY) || __MN_DEEPSEEK_API_GLOBAL__.DEFAULT_MODEL,
    };
    if (!profiles.deepseek || (!profiles.deepseek.apiKey && legacyDeepSeek.apiKey)) {
      profiles.deepseek = Object.assign({}, safeAiProfile("deepseek", profiles.deepseek), legacyDeepSeek);
    }
    const current = safeAiProfile(provider, profiles[provider]);
    return {
      provider,
      providers: profiles,
      apiKey: current.apiKey,
      baseUrl: current.baseUrl,
      model: current.model,
    };
  }

  function getAiSettings() {
    return savedAiSettings();
  }

  function getMnChatAiModels() {
    return __MN_MOMO_CHAT_AI_API_GLOBAL__.getModels();
  }

  function saveAiSettings(context, payload) {
    const input = payload && typeof payload === "object" ? payload : {};
    const requestedProvider = input.provider || __MN_DEEPSEEK_API_GLOBAL__.DEFAULT_PROVIDER;
    const settings = __MN_DEEPSEEK_API_GLOBAL__.normalizeSettings(Object.assign({}, input, { provider: requestedProvider }));
    const provider = settings.provider;
    let mnChatAiSelection;
    if (provider === "mnchatai" && (input.mnChatAiSource !== undefined || input.mnChatAiModel !== undefined)) {
      if (typeof input.mnChatAiSource !== "string" || typeof input.mnChatAiModel !== "string") {
        throw new Error("请选择 MN ChatAI 服务商和模型");
      }
      mnChatAiSelection = __MN_MOMO_CHAT_AI_API_GLOBAL__.selectModel(input.mnChatAiSource, input.mnChatAiModel);
    }
    const defaults = NSUserDefaults.standardUserDefaults();
    const profiles = readAiProfiles();
    const submittedProfiles = input.providers && typeof input.providers === "object"
      ? input.providers
      : {};
    Object.keys(submittedProfiles).forEach(function (profileProvider) {
      profiles[profileProvider] = safeAiProfile(profileProvider, submittedProfiles[profileProvider]);
    });
    profiles[provider] = {
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
    };
    defaults.setObjectForKey(JSON.stringify(profiles), AI_PROFILES_KEY);
    defaults.setObjectForKey(provider, AI_PROVIDER_KEY);
    if (provider === "deepseek") {
      defaults.setObjectForKey(settings.apiKey, AI_API_KEY_KEY);
      defaults.setObjectForKey(settings.baseUrl, AI_BASE_URL_KEY);
      defaults.setObjectForKey(settings.model, AI_MODEL_KEY);
    }
    return {
      saved: true,
      provider,
      providerLabel: __MN_DEEPSEEK_API_GLOBAL__.providerLabel(provider),
      apiKeyConfigured: !!settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      mnChatAiSelection: mnChatAiSelection || null,
    };
  }

  function testAiConnection(context, payload) {
    return __MN_DEEPSEEK_API_GLOBAL__.testConnection(payload || {});
  }

  function cancelAiReadingGeneration(context, payload) {
    const requestToken = payload && typeof payload.requestToken === "string" ? payload.requestToken : "";
    if (!requestToken) throw new Error("缺少本次生成任务标识");
    return __MN_MOMO_CHAT_AI_API_GLOBAL__.cancel(requestToken);
  }

  function getTodayFinishedWords(context, payload) {
    const token = payload && typeof payload.token === "string" && payload.token.trim()
      ? payload.token.trim()
      : savedToken();
    return __MN_MOMO_API_GLOBAL__.todayFinishedItems(token).then(function (items) {
      return { items };
    });
  }

  function listAiReadingHistory() {
    return { entries: __MN_MOMO_READING_HISTORY_GLOBAL__.listHistory() };
  }

  function clearAiReadingHistory(context, payload) {
    if (!payload || payload.confirmed !== true) throw new Error("请先确认清除 AI 阅读历史");
    __MN_MOMO_READING_HISTORY_GLOBAL__.clearHistory();
    // 清除成功后使旧请求失效，避免暂停的生成任务稍后又写回历史。
    readingHistoryRevision += 1;
    return { cleared: true, entries: [] };
  }

  function generateTodayReading(context, payload) {
    const historyRevision = readingHistoryRevision;
    const input = payload && typeof payload === "object" ? payload : {};
    const settings = input.settings && typeof input.settings === "object"
      ? input.settings
      : savedAiSettings();
    return __MN_DEEPSEEK_API_GLOBAL__.generateArticle(
      settings,
      input.words,
      input,
    ).then(function (result) {
      if (historyRevision !== readingHistoryRevision) {
        throw new Error("阅读历史已清除，本次生成结果未保存");
      }
      const historyEntry = __MN_MOMO_READING_HISTORY_GLOBAL__.recordArticle(input, result);
      return Object.assign({}, result, { historyEntry });
    });
  }

  function generateReadingQuestions(context, payload) {
    const input = payload && typeof payload === "object" ? payload : {};
    const settings = input.settings && typeof input.settings === "object"
      ? input.settings
      : savedAiSettings();
    return __MN_DEEPSEEK_API_GLOBAL__.generateQuestions(
      settings,
      input.article,
      input.words,
      input,
    ).then(function (result) {
      const historyId = input.historyId || input.articleId;
      const historyEntry = __MN_MOMO_READING_HISTORY_GLOBAL__.recordQuestions(
        historyId,
        result.questions,
      );
      return Object.assign({}, result, { historyEntry });
    });
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

  function getSelectedCards(context) {
    if (!context.addon || !context.addon.window) {
      throw new Error("当前未连接到 MarginNote 学习窗口");
    }
    const cards = __MN_MOMO_SELECTION_GLOBAL__.selectedCards(context.addon.window);
    return {
      cards,
      titles: cards.map(function (card) { return card.title; }),
      debug: __MN_MOMO_SELECTION_GLOBAL__.selectionDebug(),
    };
  }

  function listMomoNotepads() {
    return __MN_MOMO_API_GLOBAL__.listNotepads(savedToken()).then(function (notepads) {
      return { notepads };
    });
  }

  function importOptions(payload) {
    const mode = payload && typeof payload.mode === "string" ? payload.mode : "both";
    const hasBooleanOptions = payload && (
      typeof payload.addWords === "boolean" ||
      typeof payload.addExamples === "boolean" ||
      typeof payload.addStudy === "boolean"
    );
    if (!hasBooleanOptions && ["both", "words", "examples"].indexOf(mode) < 0) {
      throw new Error("导入模式无效，请重新选择");
    }
    const addWords = hasBooleanOptions ? payload.addWords === true : mode !== "examples";
    const addExamples = hasBooleanOptions ? payload.addExamples === true : mode !== "words";
    const addStudy = hasBooleanOptions ? payload.addStudy === true : false;
    return {
      addWords,
      addExamples,
      addStudy,
      advanceStudy: addStudy && payload.advanceStudy === true,
    };
  }

  function executeImport(context, payload, bookId, metadata) {
    const historyRevision = importHistoryRevision;
    const words = payload && Array.isArray(payload.words) ? payload.words : [];
    const examples = payload && Array.isArray(payload.examples) ? payload.examples : [];
    const options = importOptions(payload);
    if (!options.addWords && !options.addExamples && !options.addStudy) {
      throw new Error("请至少选择一种导入内容");
    }
    if (options.addWords && !bookId) throw new Error("当前模式需要先选择目标云词本");
    if (words.length === 0) throw new Error("没有可导入的单词");
    if (words.length > 1000) throw new Error("一次最多导入 1000 个单词");

    const apiOptions = {
      addWords: options.addWords,
      addExamples: options.addExamples,
      addStudy: options.addStudy,
      advanceStudy: options.advanceStudy,
      wordbookWords: payload && Array.isArray(payload.wordbookWords)
        ? payload.wordbookWords
        : words,
      studyWords: payload && Array.isArray(payload.studyWords)
        ? payload.studyWords
        : words,
      onProgress: function (progress) {
        if (context && typeof context.reportProgress === "function") {
          context.reportProgress(progress);
        }
      },
    };

    function saveHistory(result) {
      if (historyRevision !== importHistoryRevision) {
        return Object.assign({}, result, { historyError: "导入历史已清除，本次任务不再保存记录" });
      }
      try {
        const history = __MN_MOMO_IMPORT_HISTORY_GLOBAL__.recordImport(payload, result, {
          bookId,
          kind: metadata && metadata.kind,
          parentId: metadata && metadata.parentId,
        });
        return Object.assign({}, result, { history });
      } catch (error) {
        return Object.assign({}, result, {
          historyError: error && error.message ? error.message : "导入成功，但历史记录保存失败",
        });
      }
    }

    return __MN_MOMO_API_GLOBAL__.importWords(
      savedToken(),
      bookId,
      words,
      examples,
      apiOptions,
    ).then(saveHistory).catch(function (error) {
      const reason = error && error.message ? error.message : "导入任务失败";
      const failedResult = {
        success: [],
        duplicate: [],
        failed: options.addWords ? apiOptions.wordbookWords.slice() : [],
        examples: {
          success: [],
          duplicate: [],
          failed: options.addExamples ? examples.map(function (example) {
            return Object.assign({}, example, { reason });
          }) : [],
          error: options.addExamples ? reason : "",
        },
        study: {
          requestedCount: options.addStudy ? apiOptions.studyWords.length : 0,
          resolvedCount: 0,
          addedCount: 0,
          notAddedCount: options.addStudy ? apiOptions.studyWords.length : 0,
          missing: [],
          advanceRequested: options.advanceStudy,
          advancedCount: 0,
          notAdvancedCount: options.advanceStudy ? apiOptions.studyWords.length : 0,
          advanceError: options.advanceStudy ? reason : "",
          error: options.addStudy ? reason : "",
        },
      };
      try {
        saveHistory(failedResult);
      } catch (ignored) {
        // 历史记录保存失败时仍保留原始接口错误。
      }
      throw error;
    });
  }

  function importMomoWords(context, payload) {
    return executeImport(context, payload, savedBookId(), { kind: "import" });
  }

  function listImportHistory() {
    return {
      entries: __MN_MOMO_IMPORT_HISTORY_GLOBAL__.listHistory(),
    };
  }

  function clearImportHistory(context, payload) {
    if (!payload || payload.confirmed !== true) throw new Error("请先确认清除导入历史");
    __MN_MOMO_IMPORT_HISTORY_GLOBAL__.clearHistory();
    importHistoryRevision += 1;
    return { cleared: true, entries: [] };
  }

  function retryImportHistory(context, payload) {
    const historyId = payload && typeof payload.historyId === "string"
      ? payload.historyId
      : "";
    const entry = __MN_MOMO_IMPORT_HISTORY_GLOBAL__.findHistory(historyId);
    if (!entry) throw new Error("未找到这条导入历史，可能已被较新的记录替换");
    const retry = __MN_MOMO_IMPORT_HISTORY_GLOBAL__.retryPlan(entry);
    if (!retry || (!retry.addWords && !retry.addExamples && !retry.addStudy)) {
      throw new Error("这条历史没有可重试的失败项");
    }
    if (retry.addWords && !retry.bookId) {
      throw new Error("原导入记录没有目标云词本，无法重试失败单词");
    }
    return executeImport(context, retry, retry.bookId, {
      kind: "retry",
      parentId: entry.id,
    });
  }

  const commands = {
    ping,
    echo,
    closePanel,
    openExternalURL,
    getSettings,
    saveSettings,
    saveMomoToken,
    getMomoTokenClipboard,
    getAiKeyClipboard,
    getAiSettings,
    getMnChatAiModels,
    saveAiSettings,
    testAiConnection,
    cancelAiReadingGeneration,
    getTodayFinishedWords,
    listAiReadingHistory,
    clearAiReadingHistory,
    generateTodayReading,
    generateReadingQuestions,
    getSelectedTitles,
    getSelectedCards,
    listMomoNotepads,
    importMomoWords,
    listImportHistory,
    clearImportHistory,
    retryImportHistory,
  };

  return {
    commands,
  };
})();
