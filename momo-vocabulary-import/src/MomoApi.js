var __MN_MOMO_API_GLOBAL__ = (function () {
  const API_ROOT = "https://open.maimemo.com/open/api/v1";

  function valueForKey(object, key) {
    if (!object) return undefined;
    if (object[key] !== undefined) return object[key];
    return typeof object.objectForKey === "function" ? object.objectForKey(key) : undefined;
  }

  function arrayItems(list) {
    if (!list) return [];
    const count = Number(list.count !== undefined ? list.count : list.length);
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
    for (const item of arrayItems(valueForKey(notepad, "list"))) {
      const data = valueForKey(item, "data");
      const word = valueForKey(data, "word");
      if (valueForKey(item, "type") === "WORD" && typeof word === "string" && word.trim()) {
        result[word.trim().toLowerCase()] = true;
      }
    }
    return result;
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

  function apiErrorMessage(payload) {
    const directMessage = valueForKey(payload, "message") || valueForKey(payload, "error");
    if (directMessage) return String(directMessage);

    const firstError = arrayItems(valueForKey(payload, "errors"))[0];
    const nestedMessage = valueForKey(firstError, "msg") || valueForKey(firstError, "message");
    return nestedMessage ? String(nestedMessage) : "请求被墨墨开放 API 拒绝";
  }

  function normalizedToken(token) {
    return token.trim().replace(/^Bearer\s+/i, "");
  }

  function requestJSON(token, path, method, body) {
    if (typeof token !== "string" || !normalizedToken(token)) {
      return Promise.reject(new Error("请先填写墨墨开放 API Token"));
    }

    return new Promise(function (resolve, reject) {
      const apiToken = normalizedToken(token);
      const request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(`${API_ROOT}${path}`));
      request.setHTTPMethod(method);
      request.setTimeoutInterval(10);

      const headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      };
      request.setAllHTTPHeaderFields(headers);

      if (body !== undefined) {
        request.setHTTPBody(NSJSONSerialization.dataWithJSONObjectOptions(body, 0));
      }

      NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
        request,
        NSOperationQueue.mainQueue(),
        function (response, data, error) {
          const statusCode = Number(response && response.statusCode());
          let payload = null;
          try {
            payload = data ? NSJSONSerialization.JSONObjectWithDataOptions(data, 0) : {};
          } catch (parseError) {
            reject(new Error("墨墨开放 API 返回了无法识别的数据"));
            return;
          }

          if (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)) {
            reject(new Error(apiErrorMessage(payload)));
            return;
          }

          if (error) {
            const detail = nativeErrorMessage(error);
            reject(new Error(detail
              ? `无法连接墨墨开放 API：${detail}`
              : "无法连接墨墨开放 API，请检查网络后重试"));
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

  function listNotepads(token) {
    return requestJSON(token, "/memo/notepads", "GET").then(function (payload) {
      return arrayItems(valueForKey(payload, "notepads")).map(function (notepad) {
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
    const nextContent = candidates.length === 0
      ? content
      : [content, candidates.join("\n")].filter(Boolean).join("\n");

    return {
      candidates,
      duplicates,
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

  function importWords(token, bookId, words) {
    const path = `/memo/notepads/${encodeURIComponent(bookId)}`;
    return requestJSON(token, path, "GET").then(function (payload) {
      const before = valueForKey(payload, "notepad");
      if (!before) throw new Error("未找到目标云词本，请重新加载列表后选择");

      const update = buildUpdate(before, words);
      if (update.candidates.length === 0) {
        return classify(before, before, words);
      }

      return requestJSON(token, path, "POST", update.body).then(function (response) {
        return classify(before, valueForKey(response, "notepad"), words);
      });
    });
  }

  return {
    importWords,
    listNotepads,
  };
})();
