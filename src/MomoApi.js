var __MN_MOMO_API_GLOBAL__ = (function () {
  const API_ROOT = "https://open.maimemo.com/open/api/v1";
  const MAX_EXAMPLES_PER_IMPORT = 10;
  const MAX_ESTIMATED_REQUESTS_PER_EXAMPLE = 6;
  const REQUEST_INTERVAL_MS = 1700;
  const RATE_LIMIT_RETRY_MS = 60000;
  const RATE_LIMIT_MAX_RETRIES = 2;
  const TRANSIENT_RETRY_DELAYS_MS = [2000, 5000, 10000];

  function valueForKey(object, key) {
    if (!object) return undefined;
    if (object[key] !== undefined) return object[key];
    return typeof object.objectForKey === "function" ? object.objectForKey(key) : undefined;
  }

  function arrayItems(list) {
    if (!list) return [];
    const rawCount = typeof list.count === "function"
      ? list.count()
      : list.count !== undefined ? list.count : list.length;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count < 1) return [];

    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push(typeof list.objectAtIndex === "function" ? list.objectAtIndex(index) : list[index]);
    }
    return items;
  }

  function normalizedWords(words) {
    const seen = {};
    const result = [];
    for (const value of Array.isArray(words) ? words : []) {
      if (typeof value !== "string") continue;
      const word = value.trim().toLowerCase();
      if (!word || seen[word]) continue;
      seen[word] = true;
      result.push(word);
    }
    return result;
  }

  function notepadWords(notepad) {
    const result = {};
    const parsedList = valueForKey(notepad, "list");
    for (const item of arrayItems(parsedList)) {
      const data = valueForKey(item, "data");
      const word = valueForKey(data, "word");
      if (valueForKey(item, "type") === "WORD" && typeof word === "string" && word.trim()) {
        result[word.trim().toLowerCase()] = true;
      }
    }

    // 有些接口响应会晚于原始内容发布解析后的列表。
    // 保留原始内容备用解析，避免云词本实际更新成功却因解析延迟被报告为失败。
    const content = valueForKey(notepad, "content");
    if (typeof content === "string") {
      for (const line of content.split(/\r?\n/)) {
        const word = line.trim().replace(/^[-*]\s+/, "").toLowerCase();
        if (/^[a-z][a-z'-]*$/.test(word)) result[word] = true;
      }
    }
    return result;
  }

  function rawContentWords(content) {
    const result = {};
    if (typeof content !== "string") return result;
    for (const line of content.split(/\r?\n/)) {
      const word = line.trim().replace(/^[-*]\s+/, "").toLowerCase();
      if (/^[a-z][a-z'-]*$/.test(word)) result[word] = true;
    }
    return result;
  }

  function deduplicateTargetLines(content, words) {
    if (typeof content !== "string") return "";
    const targets = {};
    for (const word of normalizedWords(words)) targets[word] = true;
    const seen = {};
    return content.split(/\r?\n/).filter(function (line) {
      const normalized = line.trim().toLowerCase();
      if (!targets[normalized]) return true;
      if (seen[normalized]) return false;
      seen[normalized] = true;
      return true;
    }).join("\n").trim();
  }

  function waitMilliseconds(milliseconds) {
    return new Promise(function (resolve) {
      if (typeof setTimeout === "function") {
        setTimeout(resolve, milliseconds);
        return;
      }

      // MarginNote 的 JavaScriptCore 环境没有浏览器 setTimeout。
      // NSTimer 是文档规定的原生计时器，可保证队列节奏真实有效。
      if (typeof NSTimer !== "undefined" &&
          typeof NSTimer.scheduledTimerWithTimeInterval === "function") {
        NSTimer.scheduledTimerWithTimeInterval(
          Math.max(0, Number(milliseconds) || 0) / 1000,
          false,
          function () { resolve(); },
        );
        return;
      }

      resolve();
    });
  }

  // 墨墨开放 API 的频控是 10 秒 20 次、60 秒 40 次。例句导入一条例句
  // 可能会查询词条、读取已有例句、提交例句并再次验证，因此不能连续发起请求。
  // 大批量队列使用约 1.7 秒间隔，为云词本等前置请求留出频控余量。
  function createRequestPacer(interval) {
    let lastRequestAt = 0;
    let chain = Promise.resolve();

    return function schedule(request) {
      const next = chain.then(function () {
        const elapsed = Date.now() - lastRequestAt;
        const delay = Math.max(0, interval - elapsed);
        return waitMilliseconds(delay).then(function () {
          lastRequestAt = Date.now();
          return request();
        });
      });
      chain = next.catch(function () {
        // 单个请求失败不能永久中断整个队列。
      });
      return next;
    };
  }

  function isRateLimitError(error) {
    const status = Number(error && error.statusCode);
    const message = String(error && error.message || "");
    return status === 429 || /too many request|rate limit|频控|请求过于频繁/i.test(message);
  }

  function transientRetryDelay(error, retryIndex) {
    if (isRateLimitError(error)) {
      return retryIndex < RATE_LIMIT_MAX_RETRIES ? RATE_LIMIT_RETRY_MS : null;
    }

    const status = Number(error && error.statusCode);
    const message = String(error && error.message || "");
    const isTransient = error && error.isNetworkError === true ||
      status === 408 || status === 500 || status === 502 || status === 503 || status === 504 ||
      /无法连接|网络连接|请求超时|timed out|network connection|temporarily unavailable/i.test(message);
    if (!isTransient) return null;
    return retryIndex < TRANSIENT_RETRY_DELAYS_MS.length
      ? TRANSIENT_RETRY_DELAYS_MS[retryIndex]
      : null;
  }

  function createResilientRequester(onRetry) {
    const requestPacer = createRequestPacer(REQUEST_INTERVAL_MS);
    let retryCount = 0;

    return {
      schedule: function (request, metadata) {
        let retryIndex = 0;

        function attempt() {
          return requestPacer(request).catch(function (error) {
            const delay = transientRetryDelay(error, retryIndex);
            if (delay === null) throw error;

            retryIndex += 1;
            retryCount += 1;
            if (typeof onRetry === "function") {
              onRetry({
                retryCount,
                attempt: retryIndex,
                waitMilliseconds: delay,
                reason: error && error.message ? error.message : "墨墨接口暂时不可用",
                metadata: metadata || {},
              });
            }
            return waitMilliseconds(delay).then(attempt);
          });
        }

        return attempt();
      },
      retryCount: function () { return retryCount; },
    };
  }

  function notepadCompleteness(notepad, words) {
    const current = notepadWords(notepad);
    const wanted = normalizedWords(words);
    let present = 0;
    for (const word of wanted) {
      if (current[word]) present += 1;
    }
    return { present, total: wanted.length };
  }

  function preferNotepad(first, second, words) {
    if (!first) return second;
    if (!second) return first;

    const firstScore = notepadCompleteness(first, words);
    const secondScore = notepadCompleteness(second, words);
    if (secondScore.present !== firstScore.present) {
      return secondScore.present > firstScore.present ? second : first;
    }

    const firstCount = Object.keys(notepadWords(first)).length;
    const secondCount = Object.keys(notepadWords(second)).length;
    return secondCount >= firstCount ? second : first;
  }

  function readNotepadUntilWords(token, path, notepad, words) {
    const wanted = normalizedWords(words);
    let attempt = 0;
    const maxAttempts = 6;

    function poll(current) {
      const currentWords = notepadWords(current);
      const missingWords = wanted.filter(function (word) {
        return !currentWords[word];
      });
      if (missingWords.length === 0 || attempt >= maxAttempts) {
        return Promise.resolve({ notepad: current, missingWords });
      }

      attempt += 1;
      return waitMilliseconds(500).then(function () {
        return requestJSON(token, path, "GET");
      }).then(function (payload) {
        const next = extractNotepad(payload);
        if (!next) throw new Error("墨墨已接受请求，但无法读取更新后的云词本");
        return poll(preferNotepad(current, next, wanted));
      });
    }

    return poll(notepad);
  }

  function nativeErrorMessage(error) {
    if (!error) return "";
    try {
      let message = error.localizedDescription || error.message;
      if (typeof message === "function") message = message.call(error);
      if (message) return String(message);

      const domain = error.domain;
      const code = error.code;
      return domain || code !== undefined ? `${String(domain || "NSError")} (${String(code)})` : "";
    } catch (ignored) {
      return "";
    }
  }

  function isNativeNil(value) {
    return value === null
      || typeof value === "undefined"
      || (typeof NSNull !== "undefined" && value instanceof NSNull);
  }

  function apiErrorMessage(payload) {
    const directMessage = valueForKey(payload, "message") || valueForKey(payload, "error");
    if (directMessage) {
      const message = String(directMessage);
      if (/too many request|rate limit|频控|请求过于频繁/i.test(message)) {
        return "墨墨开放 API 请求过于频繁，请等待约 1 分钟后再试";
      }
      return message;
    }

    const firstError = arrayItems(valueForKey(payload, "errors"))[0];
    const nestedMessage = valueForKey(firstError, "msg") || valueForKey(firstError, "message");
    if (nestedMessage && /too many request|rate limit|频控|请求过于频繁/i.test(String(nestedMessage))) {
      return "墨墨开放 API 请求过于频繁，请等待约 1 分钟后再试";
    }
    return nestedMessage ? String(nestedMessage) : "请求被墨墨开放 API 拒绝";
  }

  function looksLikeNotepad(value) {
    if (!value) return false;
    return valueForKey(value, "id") !== undefined
      || valueForKey(value, "title") !== undefined
      || valueForKey(value, "content") !== undefined
      || valueForKey(value, "list") !== undefined;
  }

  function extractNotepad(payload) {
    const direct = valueForKey(payload, "notepad");
    if (looksLikeNotepad(direct)) return direct;

    const data = valueForKey(payload, "data");
    const nested = valueForKey(data, "notepad");
    if (looksLikeNotepad(nested)) return nested;
    if (looksLikeNotepad(data)) return data;
    if (looksLikeNotepad(payload)) return payload;
    return undefined;
  }

  function normalizedToken(token) {
    return token.trim().replace(/^Bearer\s+/i, "");
  }

  function uncachedPath(path) {
    const separator = path.indexOf("?") >= 0 ? "&" : "?";
    return `${path}${separator}_mn_refresh=${Date.now()}`;
  }

  function requestJSON(token, path, method, body) {
    if (typeof token !== "string" || !normalizedToken(token)) {
      return Promise.reject(new Error("请先填写墨墨开放 API Token"));
    }

    return new Promise(function (resolve, reject) {
      const apiToken = normalizedToken(token);
      const requestPath = method === "GET" ? uncachedPath(path) : path;
      const request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(`${API_ROOT}${requestPath}`));
      request.setHTTPMethod(method);
      request.setTimeoutInterval(10);

      const headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiToken}`,
        "Cache-Control": "no-cache, no-store",
        "Pragma": "no-cache",
      };
      request.setAllHTTPHeaderFields(headers);

      if (body !== undefined) {
        request.setHTTPBody(NSJSONSerialization.dataWithJSONObjectOptions(body, 0));
      }

      NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
        request,
        NSOperationQueue.mainQueue(),
        function (response, data, error) {
          if (!isNativeNil(error)) {
            const detail = nativeErrorMessage(error);
            const networkError = new Error(detail
              ? `无法连接墨墨开放 API：${detail}`
              : "无法连接墨墨开放 API，请检查网络后重试");
            networkError.isNetworkError = true;
            reject(networkError);
            return;
          }

          const statusCode = Number(response && response.statusCode());
          let payload = null;
          try {
            payload = isNativeNil(data) ? {} : NSJSONSerialization.JSONObjectWithDataOptions(data, 1);
          } catch (parseError) {
            reject(new Error("墨墨开放 API 返回了无法识别的数据"));
            return;
          }

          if (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)) {
            const apiError = new Error(apiErrorMessage(payload));
            apiError.statusCode = statusCode;
            reject(apiError);
            return;
          }

          if (!Number.isFinite(statusCode)) {
            reject(new Error("墨墨开放 API 未返回有效响应"));
            return;
          }

          resolve(payload || {});
        },
      );
    });
  }

  // 当前开放接口使用 /phrases 等资源路径。旧版本曾在 /memo 下提供相同资源，
  // 因此为仍被路由到兼容接口的用户保留备用路径。
  function requestJSONWithFallback(token, paths, method, body) {
    const candidates = Array.isArray(paths) ? paths.filter(Boolean) : [];
    if (candidates.length === 0) return Promise.reject(new Error("墨墨开放 API 请求路径为空"));

    let index = 0;
    function attempt() {
      return requestJSON(token, candidates[index], method, body).catch(function (error) {
        const status = Number(error && error.statusCode);
        const message = String(error && error.message || "");
        const canTryNext = index + 1 < candidates.length && (
          status === 400 || status === 404 || status === 405 ||
          /invalid parameters|not found|不存在|未知路径/i.test(message)
        );
        if (!canTryNext) throw error;
        index += 1;
        return attempt();
      });
    }
    return attempt();
  }

  function listNotepads(token) {
    return requestJSON(token, "/memo/notepads?limit=10&offset=0", "GET").then(function (payload) {
      const directList = valueForKey(payload, "notepads");
      const data = valueForKey(payload, "data");
      const nestedList = valueForKey(data, "notepads");
      const list = !isNativeNil(directList) ? directList : nestedList;
      return arrayItems(list).map(function (notepad) {
        return {
          id: String(valueForKey(notepad, "id") || ""),
          title: String(valueForKey(notepad, "title") || "未命名云词本"),
        };
      }).filter(function (notepad) {
        return !!notepad.id;
      });
    });
  }

  function buildUpdate(notepad, words) {
    const existing = notepadWords(notepad);
    const candidates = [];
    const duplicates = [];
    for (const word of normalizedWords(words)) {
      if (existing[word]) {
        duplicates.push(word);
      } else {
        candidates.push(word);
      }
    }

    const content = String(valueForKey(notepad, "content") || "").trim();
    const rawWords = rawContentWords(content);
    const normalizedContent = deduplicateTargetLines(content, words);
    const appendCandidates = candidates.filter(function (word) {
      return !rawWords[word];
    });
    const nextContent = candidates.length === 0
      ? normalizedContent
      : [normalizedContent, appendCandidates.join("\n")].filter(Boolean).join("\n");

    return {
      candidates,
      duplicates,
      contentChanged: nextContent !== content,
      body: {
        id: String(valueForKey(notepad, "id")),
        notepad: {
          status: valueForKey(notepad, "status"),
          content: nextContent,
          title: valueForKey(notepad, "title"),
          brief: valueForKey(notepad, "brief"),
          tags: arrayItems(valueForKey(notepad, "tags")),
        },
      },
    };
  }

  function classify(before, after, words) {
    const previous = notepadWords(before);
    const current = notepadWords(after);
    const result = { success: [], duplicate: [], failed: [] };

    for (const word of normalizedWords(words)) {
      if (previous[word]) {
        result.duplicate.push(word);
      } else if (current[word]) {
        result.success.push(word);
      } else {
        result.failed.push(word);
      }
    }
    return result;
  }

  function vocabularyItems(payload) {
    const direct = valueForKey(payload, "voc");
    const data = valueForKey(payload, "data");
    const nested = valueForKey(data, "voc");
    const list = !isNativeNil(direct) ? direct : nested;
    return arrayItems(list);
  }

  function phraseItems(payload) {
    const direct = valueForKey(payload, "phrases");
    const data = valueForKey(payload, "data");
    const nested = valueForKey(data, "phrases");
    const list = !isNativeNil(direct) ? direct : nested;
    return arrayItems(list);
  }

  function normalizedExamples(examples) {
    const seen = {};
    const result = [];
    for (const value of Array.isArray(examples) ? examples : []) {
      if (!value || typeof value !== "object") continue;
      const word = typeof value.word === "string"
        ? value.word.trim().toLowerCase()
        : "";
      const phrase = typeof value.phrase === "string"
        ? value.phrase.trim()
        : typeof value.sentence === "string" ? value.sentence.trim() : "";
      const interpretation = typeof value.interpretation === "string"
        ? value.interpretation.trim()
        : typeof value.translation === "string" ? value.translation.trim() : "";
      const origin = typeof value.origin === "string" ? value.origin.trim() : "";
      const lemma = typeof value.lemma === "string"
        ? value.lemma.trim().toLowerCase()
        : word;
      if (!word || !phrase || !interpretation) continue;

      const key = `${lemma}\u0000${phrase}\u0000${interpretation}`;
      if (seen[key]) continue;
      seen[key] = true;
      result.push({ word, lemma, phrase, interpretation, origin });
    }
    return result;
  }

  function queryVocabularyIds(token, words) {
    const spellings = normalizedWords(words);
    if (spellings.length === 0) return Promise.resolve({});

    return requestJSONWithFallback(token, ["/vocabulary/query", "/memo/vocabulary/query"], "POST", {
          // 接口将拼写和 ID 视为互斥参数。发送 ids:null 会让部分服务器版本拒绝整个请求。
      spellings,
    }).then(function (payload) {
      const ids = {};
      for (const vocabulary of vocabularyItems(payload)) {
        const id = valueForKey(vocabulary, "id");
        const spelling = valueForKey(vocabulary, "spelling");
        if (id === undefined || typeof spelling !== "string") continue;
        ids[spelling.trim().toLowerCase()] = String(id);
      }
      return ids;
    });
  }

  function emptyExampleResult(error) {
    return {
      success: [],
      duplicate: [],
      failed: [],
      error: error || "",
    };
  }

  function emptyStudyResult(error) {
    return {
      requestedCount: 0,
      resolvedCount: 0,
      addedCount: 0,
      notAddedCount: 0,
      missing: [],
      advanceRequested: false,
      advancedCount: 0,
      notAdvancedCount: 0,
      advanceError: "",
      error: error || "",
    };
  }

  function advanceStudyErrorMessage(error) {
    const message = error && error.message ? String(error.message) : "";
    if (/permission denied|forbidden|权限不足/i.test(message)) {
      return "权限不足：墨墨提前复习要求账号达到 10 级，请确认当前 Token 所属账号等级，并在墨墨 App 中开启自动同步";
    }
    return message || "墨墨提前复习接口拒绝了请求";
  }

  function importStudyWords(token, words, advanceStudy) {
    const spellings = normalizedWords(words);
    if (spellings.length === 0) return Promise.resolve(emptyStudyResult());
    const requestPacer = createRequestPacer(700);

    return requestPacer(function () {
      return queryVocabularyIds(token, spellings);
    }).then(function (vocabularyIds) {
      const missing = [];
      const vocabularyWords = [];
      const seenIds = {};
      for (const spelling of spellings) {
        const id = vocabularyIds[spelling];
        if (!id) {
          missing.push(spelling);
        } else if (!seenIds[id]) {
          seenIds[id] = true;
          vocabularyWords.push({ id });
        }
      }

      const baseResult = {
        requestedCount: spellings.length,
        resolvedCount: vocabularyWords.length,
        addedCount: 0,
        notAddedCount: vocabularyWords.length,
        missing,
        advanceRequested: advanceStudy === true,
        advancedCount: 0,
        notAdvancedCount: advanceStudy === true ? vocabularyWords.length : 0,
        advanceError: "",
        error: "",
      };
      if (vocabularyWords.length === 0) return baseResult;

      return requestPacer(function () {
        return requestJSON(token, "/memo/study/add_words", "POST", {
          words: vocabularyWords,
          // 将添加和提前复习保持为两个明确操作。add_words 的 advance 参数无法可靠处理
          // 已经在学习列表中的单词，而 advance_study 正是为这种情况设计的。
          advance: false,
        });
      }).then(function (payload) {
        const data = valueForKey(payload, "data");
        const rawAddedCount = valueForKey(payload, "added_count") !== undefined
          ? valueForKey(payload, "added_count")
          : valueForKey(data, "added_count");
        const parsedAddedCount = Number(rawAddedCount);
        const addedCount = Number.isFinite(parsedAddedCount)
          ? Math.max(0, Math.min(vocabularyWords.length, parsedAddedCount))
          : 0;
        const addResult = Object.assign({}, baseResult, {
          addedCount,
          notAddedCount: vocabularyWords.length - addedCount,
        });
        if (!advanceStudy) return addResult;

        return requestPacer(function () {
          return requestJSON(token, "/memo/study/advance_study", "POST", {
            voc_ids: vocabularyWords.map(function (word) { return word.id; }),
          });
        }).then(function (advancePayload) {
          const advanceData = valueForKey(advancePayload, "data");
          const rawAdvancedCount = valueForKey(advancePayload, "advanced_count") !== undefined
            ? valueForKey(advancePayload, "advanced_count")
            : valueForKey(advanceData, "advanced_count");
          const parsedAdvancedCount = Number(rawAdvancedCount);
          const advancedCount = Number.isFinite(parsedAdvancedCount)
            ? Math.max(0, Math.min(vocabularyWords.length, parsedAdvancedCount))
            : 0;
          return Object.assign({}, addResult, {
            advancedCount,
            notAdvancedCount: vocabularyWords.length - advancedCount,
          });
        }).catch(function (error) {
          return Object.assign({}, addResult, {
            advanceError: advanceStudyErrorMessage(error),
          });
        });
      });
    });
  }

  function phraseMatches(items, example) {
    return items.some(function (item) {
      return String(valueForKey(item, "phrase") || "").trim() === example.phrase &&
        String(valueForKey(item, "interpretation") || "").trim() === example.interpretation;
    });
  }

  function refreshPhrases(token, vocabularyId, phraseCache) {
    const query = `?voc_id=${encodeURIComponent(vocabularyId)}`;
    return requestJSONWithFallback(token, [`/phrases${query}`, `/memo/phrases${query}`], "GET").then(function (payload) {
      phraseCache[vocabularyId] = phraseItems(payload);
      return phraseCache[vocabularyId];
    });
  }

  function vocabularyTargets(vocabularyIds, example) {
    const ids = [];
    const missing = [];
    const spellings = [example.lemma, example.word];

    for (const spelling of spellings) {
      if (!spelling || missing.indexOf(spelling) >= 0) continue;
      const vocabularyId = vocabularyIds[spelling];
      if (!vocabularyId) {
        missing.push(spelling);
        continue;
      }
      if (ids.indexOf(vocabularyId) < 0) ids.push(vocabularyId);
    }

    return { ids, missing };
  }

  function appendTargetedExampleResult(result, example, successCount, duplicateCount, failures) {
    if (successCount > 0) {
      result.success.push(example);
      return;
    }
    if (duplicateCount > 0) {
      result.duplicate.push(example);
      return;
    }
    result.failed.push(Object.assign({}, example, {
      reason: failures.length > 0
        ? failures.join("；")
        : "墨墨例句未完成提交",
    }));
  }

  // 每个词条只进行一次初始读取和一次最终验证。之前每次 POST 后都读取例句列表，
  // 会导致十条例句批次超过接口请求配额。
  function importExamples(token, words, examples, queueContext) {
    const candidates = normalizedExamples(examples);
    if (candidates.length === 0) return Promise.resolve(emptyExampleResult());
    if (candidates.length > MAX_EXAMPLES_PER_IMPORT) {
      return Promise.resolve(emptyExampleResult(
        `单次最多上传 ${MAX_EXAMPLES_PER_IMPORT} 条例句，请分批选择卡片后再导入`,
      ));
    }

    const requester = queueContext && queueContext.requester
      ? queueContext.requester
      : createResilientRequester();
    const lookupWords = [];
    for (const example of candidates) {
      lookupWords.push(example.lemma, example.word);
    }

    return requester.schedule(function () {
      return queryVocabularyIds(token, lookupWords);
    }, { operation: "queryVocabulary" }).then(function (vocabularyIds) {
      const result = emptyExampleResult();
      const phraseCache = {};
      const targetStates = {};
      const targetIds = [];
      const records = candidates.map(function (example) {
        const targets = vocabularyTargets(vocabularyIds, example);
        for (const vocabularyId of targets.ids) {
          if (targetIds.indexOf(vocabularyId) < 0) targetIds.push(vocabularyId);
        }
        return {
          example,
          targets,
          outcomes: {},
          failures: [],
        };
      });

      if (queueContext && typeof queueContext.onEstimate === "function") {
        let possibleCreates = 0;
        for (const record of records) possibleCreates += record.targets.ids.length;
        queueContext.onEstimate(targetIds.length + possibleCreates + targetIds.length);
      }

      let chain = Promise.resolve();

      // 提交例句前，每个目标只读取一次。
      for (const vocabularyId of targetIds) {
        chain = chain.then(function () {
          return requester.schedule(function () {
            return refreshPhrases(token, vocabularyId, phraseCache);
          }, { operation: "readPhrases", vocabularyId }).then(function (existing) {
            targetStates[vocabularyId] = {
              initial: existing,
              final: existing,
              pending: {},
              verifyError: "",
            };
          }).catch(function (error) {
            targetStates[vocabularyId] = {
              initial: [],
              final: [],
              pending: {},
              verifyError: error && error.message
                ? error.message
                : "墨墨例句列表读取失败",
            };
          });
        });
      }

      chain = chain.then(function () {
        if (!queueContext || typeof queueContext.onEstimate !== "function") return;
        const pendingByTarget = {};
        for (const record of records) {
          for (const vocabularyId of record.targets.ids) {
            const state = targetStates[vocabularyId];
            if (!state || state.verifyError || phraseMatches(state.initial, record.example)) continue;
            if (!pendingByTarget[vocabularyId]) pendingByTarget[vocabularyId] = {};
            const key = `${record.example.phrase}\u0000${record.example.interpretation}`;
            pendingByTarget[vocabularyId][key] = true;
          }
        }

        let createRequests = 0;
        const verifyRequests = Object.keys(pendingByTarget).length;
        for (const vocabularyId of Object.keys(pendingByTarget)) {
          createRequests += Object.keys(pendingByTarget[vocabularyId]).length;
        }
        queueContext.onEstimate(createRequests + verifyRequests);
      });

      // 提交每条缺失例句，但暂不重新读取完整列表。
      for (const record of records) {
        for (const vocabularyId of record.targets.ids) {
          chain = chain.then(function () {
            const state = targetStates[vocabularyId];
            if (!state || state.verifyError) {
              record.outcomes[vocabularyId] = "failed";
              record.failures.push(state && state.verifyError
                ? state.verifyError
                : "墨墨例句列表读取失败");
              return undefined;
            }

            const key = `${record.example.phrase}\u0000${record.example.interpretation}`;
            if (phraseMatches(state.initial, record.example) || state.pending[key]) {
              record.outcomes[vocabularyId] = "duplicate";
              return undefined;
            }

            return requester.schedule(function () {
              return requestJSONWithFallback(token, ["/phrases", "/memo/phrases"], "POST", {
                phrase: {
                  voc_id: vocabularyId,
                  phrase: record.example.phrase,
                  interpretation: record.example.interpretation,
                  tags: ["考研"],
                  origin: record.example.origin,
                },
              });
            }, { operation: "createPhrase", vocabularyId }).then(function () {
              state.pending[key] = true;
              record.outcomes[vocabularyId] = "posted";
            }).catch(function (error) {
              record.outcomes[vocabularyId] = "failed";
              record.failures.push(error && error.message
                ? error.message
                : "墨墨例句接口拒绝了请求");
            });
          });
        }
      }

      // 对每个目标最后读取一次，验证全部已提交例句。
      for (const vocabularyId of targetIds) {
        chain = chain.then(function () {
          const state = targetStates[vocabularyId];
          if (!state || Object.keys(state.pending).length === 0 || state.verifyError) {
            return undefined;
          }
          return requester.schedule(function () {
            return refreshPhrases(token, vocabularyId, phraseCache);
          }, { operation: "verifyPhrases", vocabularyId }).then(function (updated) {
            state.final = updated;
          }).catch(function (error) {
            state.verifyError = error && error.message
              ? error.message
              : "墨墨例句列表验证失败";
          });
        });
      }

      return chain.then(function () {
        for (const record of records) {
          const targets = record.targets;
          if (targets.ids.length === 0) {
            result.failed.push(Object.assign({}, record.example, {
              reason: "墨墨未找到对应的单词 ID",
            }));
            continue;
          }

          let targetSuccessCount = 0;
          let targetDuplicateCount = 0;
          const failures = record.failures.slice();
          for (const vocabularyId of targets.ids) {
            const outcome = record.outcomes[vocabularyId];
            const state = targetStates[vocabularyId];
            if (outcome === "duplicate") {
              targetDuplicateCount += 1;
            } else if (outcome === "posted") {
              if (state && state.verifyError) {
                failures.push(state.verifyError);
              } else if (phraseMatches(state ? state.final : [], record.example)) {
                targetSuccessCount += 1;
              } else {
                failures.push("墨墨接口已响应，但重新读取时未找到这条例句");
              }
            } else if (outcome !== "failed") {
              failures.push("墨墨例句未完成提交");
            }
          }

          appendTargetedExampleResult(
            result,
            record.example,
            targetSuccessCount,
            targetDuplicateCount,
            failures,
          );
        }
        return result;
      });
    });
  }

  function appendExampleResult(target, source) {
    target.success = target.success.concat(source && source.success || []);
    target.duplicate = target.duplicate.concat(source && source.duplicate || []);
    target.failed = target.failed.concat(source && source.failed || []);
    if (source && source.error && !target.error) target.error = source.error;
    return target;
  }

  function importExampleQueue(token, words, examples, options) {
    const candidates = normalizedExamples(examples);
    const totalBatches = Math.ceil(candidates.length / MAX_EXAMPLES_PER_IMPORT);
    const result = emptyExampleResult();
    const onProgress = options && typeof options.onProgress === "function"
      ? options.onProgress
      : function () {};
    const requester = createResilientRequester(function (retry) {
      onProgress({
        phase: "waiting",
        batchIndex: retry.metadata && retry.metadata.batchIndex || 0,
        totalBatches,
        retryCount: retry.retryCount,
        waitSeconds: Math.ceil(retry.waitMilliseconds / 1000),
        reason: retry.reason,
      });
    });
    let completedExamples = 0;
    let stopped = false;
    let estimatedRemainingRequests = Math.ceil(candidates.length / MAX_EXAMPLES_PER_IMPORT) +
      candidates.length * MAX_ESTIMATED_REQUESTS_PER_EXAMPLE;

    function estimatedRemainingSeconds() {
      return Math.max(0, Math.ceil(estimatedRemainingRequests * REQUEST_INTERVAL_MS / 1000));
    }

    function reportEstimate(batchIndex, phase) {
      onProgress({
        phase: phase || "uploading",
        batchIndex,
        totalBatches,
        completedExamples,
        totalExamples: candidates.length,
        retryCount: requester.retryCount(),
        estimatedRemainingSeconds: estimatedRemainingSeconds(),
      });
    }

    if (candidates.length === 0) {
      result.queue = { batchSize: MAX_EXAMPLES_PER_IMPORT, totalBatches: 0, retryCount: 0 };
      return Promise.resolve(result);
    }

    function processBatch(index) {
      if (index >= totalBatches) return Promise.resolve();
      const batchIndex = index + 1;
      const batch = candidates.slice(
        index * MAX_EXAMPLES_PER_IMPORT,
        batchIndex * MAX_EXAMPLES_PER_IMPORT,
      );
      onProgress({
        phase: "uploading",
        batchIndex,
        totalBatches,
        completedExamples: index * MAX_EXAMPLES_PER_IMPORT,
        totalExamples: candidates.length,
        retryCount: requester.retryCount(),
        estimatedRemainingSeconds: estimatedRemainingSeconds(),
      });

      const batchRequester = {
        schedule: function (request, metadata) {
          return requester.schedule(request, Object.assign({}, metadata, { batchIndex }))
            .then(function (value) {
              estimatedRemainingRequests = Math.max(0, estimatedRemainingRequests - 1);
              reportEstimate(batchIndex);
              return value;
            }, function (error) {
              estimatedRemainingRequests = Math.max(0, estimatedRemainingRequests - 1);
              reportEstimate(batchIndex);
              throw error;
            });
        },
        onEstimate: function (currentBatchRequests) {
          const remainingExamples = Math.max(0, candidates.length - batchIndex * MAX_EXAMPLES_PER_IMPORT);
          const futureRequests = Math.ceil(remainingExamples / MAX_EXAMPLES_PER_IMPORT) +
            remainingExamples * MAX_ESTIMATED_REQUESTS_PER_EXAMPLE;
          estimatedRemainingRequests = Math.min(
            estimatedRemainingRequests,
            Math.max(0, Number(currentBatchRequests) || 0) + futureRequests,
          );
          reportEstimate(batchIndex);
        },
      };
      return importExamples(token, words, batch, {
        requester: batchRequester,
        onEstimate: batchRequester.onEstimate,
      })
        .then(function (batchResult) {
          appendExampleResult(result, batchResult);
          completedExamples = Math.min(
            batchIndex * MAX_EXAMPLES_PER_IMPORT,
            candidates.length,
          );
          onProgress({
            phase: "batchComplete",
            batchIndex,
            totalBatches,
            completedExamples,
            totalExamples: candidates.length,
            retryCount: requester.retryCount(),
          });
          return processBatch(batchIndex);
        }).catch(function (error) {
          const reason = error && error.message ? error.message : "例句批次上传失败";
          for (let remainingIndex = index * MAX_EXAMPLES_PER_IMPORT;
            remainingIndex < candidates.length;
            remainingIndex += 1) {
            result.failed.push(Object.assign({}, candidates[remainingIndex], { reason }));
          }
          result.error = `第 ${batchIndex}/${totalBatches} 批失败，后续批次未提交：${reason}`;
          stopped = true;
          onProgress({
            phase: "failed",
            batchIndex,
            totalBatches,
            completedExamples,
            totalExamples: candidates.length,
            retryCount: requester.retryCount(),
            reason,
          });
        });
    }

    return processBatch(0).then(function () {
      result.queue = {
        batchSize: MAX_EXAMPLES_PER_IMPORT,
        totalBatches,
        completedExamples,
        retryCount: requester.retryCount(),
      };
      if (!stopped) {
        onProgress({
          phase: "complete",
          batchIndex: totalBatches,
          totalBatches,
          completedExamples: candidates.length,
          totalExamples: candidates.length,
          retryCount: requester.retryCount(),
        });
      }
      return result;
    });
  }

  function importWords(token, bookId, words, examples, options) {
    const addWords = !options || options.addWords !== false;
    const addExamples = !options || options.addExamples !== false;
    const addStudy = !!(options && options.addStudy === true);
    const advanceStudy = addStudy && !!(options && options.advanceStudy === true);
    const wordbookWords = options && Array.isArray(options.wordbookWords)
      ? options.wordbookWords
      : words;
    const studyWords = options && Array.isArray(options.studyWords)
      ? options.studyWords
      : words;
    const path = addWords ? `/memo/notepads/${encodeURIComponent(bookId)}` : "";

    function finish(before, after) {
      const wordResult = before && after
        ? classify(before, after, wordbookWords)
        : { success: [], duplicate: [], failed: [] };
      const examplePromise = addExamples
        ? importExampleQueue(token, words, examples, options)
        : Promise.resolve(emptyExampleResult());
      return examplePromise.catch(function (error) {
        return emptyExampleResult(error && error.message
            ? error.message
            : "无法查询墨墨单词 ID，例句未上传");
      }).then(function (exampleResult) {
        const studyPromise = addStudy
          ? waitMilliseconds(addExamples && Array.isArray(examples) && examples.length > 0 ? 700 : 0)
            .then(function () { return importStudyWords(token, studyWords, advanceStudy); })
          : Promise.resolve(emptyStudyResult());
        return studyPromise.catch(function (error) {
          return emptyStudyResult(error && error.message
            ? error.message
            : "无法将单词添加到墨墨背诵列表");
        }).then(function (studyResult) {
          return Object.assign({}, wordResult, {
            examples: exampleResult,
            study: studyResult,
          });
        });
      });
    }

    if (!addWords) return finish(null, null);

    return requestJSON(token, path, "GET").then(function (payload) {
      const before = extractNotepad(payload);
      if (!before) throw new Error("未找到目标云词本，请重新加载列表后选择");

      const update = buildUpdate(before, wordbookWords);
      if (update.candidates.length === 0 && !update.contentChanged) {
        return finish(before, before);
      }

      return requestJSON(token, path, "POST", update.body).then(function (postPayload) {
        const posted = extractNotepad(postPayload);
        const postedCheck = notepadCompleteness(posted, update.candidates);
        // 文档中的更新响应包含解析后的词本。如果已经包含全部提交单词，立即使用它，
        // 不再等待可能命中缓存的 GET 响应。
        if (posted && postedCheck.present === postedCheck.total) {
          return finish(before, posted);
        }

        // POST 响应通常只是确认，不包含更新后的单词列表。
        // 否则执行一次新读取，保持原插件的快速行为。重复轮询会拖慢每次导入，
        // 也无法解决服务器端解析缓存问题。
        return requestJSON(token, path, "GET").then(function (payload) {
          const after = extractNotepad(payload);
          if (!after) throw new Error("墨墨已接受请求，但无法读取更新后的云词本");
          const initial = preferNotepad(posted, after, update.candidates);
          return finish(before, initial);
        });
      });
    });
  }

  function studyItems(payload) {
    if (Array.isArray(payload)) return payload;
    const directItems = valueForKey(payload, "items");
    if (directItems) return arrayItems(directItems);
    const directTodayItems = valueForKey(payload, "today_items");
    if (directTodayItems) return arrayItems(directTodayItems);
    const data = valueForKey(payload, "data");
    const nestedItems = valueForKey(data, "items") || valueForKey(data, "today_items");
    if (nestedItems) return arrayItems(nestedItems);
    if (Array.isArray(data) || (data && typeof data.count === "function")) return arrayItems(data);
    return [];
  }

  function todayFinishedItems(token) {
    return requestJSON(token, "/memo/study/get_today_items", "POST", {
      is_finished: true,
      limit: 1000,
    }).then(function (payload) {
      const seen = {};
      const result = [];
      for (const item of studyItems(payload)) {
        const finished = valueForKey(item, "is_finished");
        if (finished !== undefined && finished !== true && String(finished) !== "1") continue;
        const rawId = valueForKey(item, "voc_id");
        const rawSpelling = valueForKey(item, "voc_spelling") || valueForKey(item, "spelling");
        const spelling = typeof rawSpelling === "string" ? rawSpelling.trim() : "";
        const id = rawId === undefined || rawId === null ? "" : String(rawId);
        if (!id && !spelling) continue;
        const key = id ? `id:${id}` : `word:${spelling.toLowerCase()}`;
        if (seen[key]) continue;
        seen[key] = true;
        result.push({ id, spelling });
      }
      return result;
    });
  }

  return {
    importWords,
    listNotepads,
    todayFinishedItems,
  };
})();
