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
      let message = error.localizedDescription;
      if (typeof message === "function") message = message.call(error);
      return message ? String(message) : "";
    } catch (ignored) {
      return "";
    }
  }

  function requestJSON(token, path, method, body) {
    if (typeof token !== "string" || !token.trim()) {
      return Promise.reject(new Error("请先填写墨墨开放 API Token"));
    }

    return new Promise(function (resolve, reject) {
      const request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(`${API_ROOT}${path}`));
      request.setHTTPMethod(method);
      request.setValueForHTTPHeaderField("application/json", "Accept");
      request.setValueForHTTPHeaderField(`Bearer ${token.trim()}`, "Authorization");

      if (body !== undefined) {
        request.setValueForHTTPHeaderField("application/json", "Content-Type");
        request.setHTTPBody(NSJSONSerialization.dataWithJSONObjectOptions(body, 0));
      }

      NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
        request,
        NSOperationQueue.mainQueue(),
        function (response, data, error) {
          if (error) {
            const detail = nativeErrorMessage(error);
            reject(new Error(detail
              ? `无法连接墨墨开放 API：${detail}`
              : "无法连接墨墨开放 API，请检查网络后重试"));
            return;
          }

          const statusCode = Number(response && response.statusCode());
          let payload = null;
          try {
            payload = data ? NSJSONSerialization.JSONObjectWithDataOptions(data, 0) : {};
          } catch (parseError) {
            reject(new Error("墨墨开放 API 返回了无法识别的数据"));
            return;
          }

          if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) {
            const message = valueForKey(payload, "message") || valueForKey(payload, "error") || "请求被墨墨开放 API 拒绝";
            reject(new Error(String(message)));
            return;
          }

          resolve(payload || {});
        },
      );
    });
  }

  function listNotepads(token) {
    return requestJSON(token, "/notepads?limit=100&offset=0", "GET").then(function (payload) {
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
    const path = `/notepads/${encodeURIComponent(bookId)}`;
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
