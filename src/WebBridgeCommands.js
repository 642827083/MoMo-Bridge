var __MN_WEB_BRIDGE_COMMANDS_GLOBAL__ = (function () {
  const TOKEN_KEY = "cn.marginnote.momo-vocabulary-import.token";
  const BOOK_ID_KEY = "cn.marginnote.momo-vocabulary-import.book-id";
  const AI_API_KEY_KEY = "cn.marginnote.momo-vocabulary-import.deepseek-api-key";
  const AI_BASE_URL_KEY = "cn.marginnote.momo-vocabulary-import.deepseek-base-url";
  const AI_MODEL_KEY = "cn.marginnote.momo-vocabulary-import.deepseek-model";
  const AI_PROVIDER_KEY = "cn.marginnote.momo-vocabulary-import.ai-provider";
  const AI_PROFILES_KEY = "cn.marginnote.momo-vocabulary-import.ai-provider-profiles";

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

  function saveAiSettings(context, payload) {
    const input = payload && typeof payload === "object" ? payload : {};
    const requestedProvider = input.provider || __MN_DEEPSEEK_API_GLOBAL__.DEFAULT_PROVIDER;
    const settings = __MN_DEEPSEEK_API_GLOBAL__.normalizeSettings(Object.assign({}, input, { provider: requestedProvider }));
    const provider = settings.provider;
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
    };
  }

  function testAiConnection(context, payload) {
    return __MN_DEEPSEEK_API_GLOBAL__.testConnection(payload || {});
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

  function generateTodayReading(context, payload) {
    const input = payload && typeof payload === "object" ? payload : {};
    const settings = input.settings && typeof input.settings === "object"
      ? input.settings
      : savedAiSettings();
    return __MN_DEEPSEEK_API_GLOBAL__.generateArticle(
      settings,
      input.words,
      input,
    ).then(function (result) {
      const historyEntry = __MN_MOMO_READING_HISTORY_GLOBAL__.recordArticle(input, result);
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
    getAiSettings,
    saveAiSettings,
    testAiConnection,
    getTodayFinishedWords,
    listAiReadingHistory,
    generateTodayReading,
    getSelectedTitles,
    getSelectedCards,
    listMomoNotepads,
    importMomoWords,
    listImportHistory,
    retryImportHistory,
  };

  return {
    commands,
  };
})();
