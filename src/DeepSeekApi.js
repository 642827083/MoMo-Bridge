var __MN_DEEPSEEK_API_GLOBAL__ = (function () {
  const DEFAULT_BASE_URL = "https://api.deepseek.com";
  const DEFAULT_MODEL = "deepseek-v4-flash";
  const DEEPSEEK_REQUEST_TIMEOUT_SECONDS = 90;

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

  function normalizeBaseUrl(value) {
    const raw = typeof value === "string" && value.trim()
      ? value.trim()
      : DEFAULT_BASE_URL;
    if (!/^https:\/\//i.test(raw)) {
      throw new Error("DeepSeek API 地址必须使用 HTTPS");
    }
    const url = NSURL.URLWithString(raw);
    if (!url) throw new Error("DeepSeek API 地址无效");
    return raw.replace(/\/+$/, "");
  }

  function normalizeSettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    return {
      apiKey: typeof source.apiKey === "string" ? source.apiKey.trim().replace(/^Bearer\s+/i, "") : "",
      baseUrl: normalizeBaseUrl(source.baseUrl),
      model: typeof source.model === "string" && source.model.trim()
        ? source.model.trim()
        : DEFAULT_MODEL,
    };
  }

  function apiErrorMessage(payload) {
    const direct = valueForKey(payload, "message");
    if (direct) return String(direct);
    const error = valueForKey(payload, "error");
    if (typeof error === "string") return error;
    const nested = valueForKey(error, "message") || valueForKey(error, "code");
    if (nested) return String(nested);
    const firstError = arrayItems(valueForKey(payload, "errors"))[0];
    const nestedError = valueForKey(firstError, "message") || valueForKey(firstError, "msg");
    return nestedError ? String(nestedError) : "DeepSeek API 拒绝了请求";
  }

  function requestJSON(settings, path, method, body) {
    let config;
    try {
      config = normalizeSettings(settings);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!config.apiKey) return Promise.reject(new Error("请先填写 DeepSeek API Key"));

    return new Promise(function (resolve, reject) {
      const url = NSURL.URLWithString(`${config.baseUrl}${path}`);
      if (!url) {
        reject(new Error("DeepSeek API 地址无效"));
        return;
      }

      const request = NSMutableURLRequest.requestWithURL(url);
      request.setHTTPMethod(method);
      request.setTimeoutInterval(DEEPSEEK_REQUEST_TIMEOUT_SECONDS);
      request.setAllHTTPHeaderFields({
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cache-Control": "no-cache, no-store",
        "Pragma": "no-cache",
        "User-Agent": "MoMo-Import/2.x",
      });

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
              ? `无法连接 DeepSeek API：${detail}`
              : "无法连接 DeepSeek API，请检查网络后重试");
            networkError.isNetworkError = true;
            reject(networkError);
            return;
          }

          const statusCode = Number(response && response.statusCode());
          let payload = null;
          try {
            payload = isNativeNil(data) ? {} : NSJSONSerialization.JSONObjectWithDataOptions(data, 1);
          } catch (parseError) {
            reject(new Error("DeepSeek API 返回了无法识别的数据"));
            return;
          }

          if (!Number.isFinite(statusCode)) {
            reject(new Error("DeepSeek API 未返回有效响应"));
            return;
          }
          if (statusCode < 200 || statusCode >= 300) {
            const apiError = new Error(apiErrorMessage(payload));
            apiError.statusCode = statusCode;
            reject(apiError);
            return;
          }
          resolve(payload || {});
        },
      );
    });
  }

  function testConnection(settings) {
    const config = normalizeSettings(settings);
    if (!config.apiKey) return Promise.reject(new Error("请先填写 DeepSeek API Key"));

    return requestJSON(config, "/chat/completions", "POST", {
      model: config.model,
      messages: [{ role: "user", content: "请只回复 OK" }],
      max_tokens: 1,
      temperature: 0,
      stream: false,
    }).then(function () {
      return {
        connected: true,
        modelAvailable: true,
        message: "连接成功，当前模型可以生成文章",
      };
    });
  }

  function normalizeReadingWords(words) {
    const seen = {};
    const result = [];
    for (const value of Array.isArray(words) ? words : []) {
      const spelling = value && typeof value.spelling === "string"
        ? value.spelling.trim()
        : typeof value === "string" ? value.trim() : "";
      if (!spelling) continue;
      const key = spelling.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      result.push({
        id: value && value.id !== undefined && value.id !== null ? String(value.id) : "",
        spelling,
      });
      if (result.length >= 30) break;
    }
    return result;
  }

  function articleTypeText(articleType) {
    if (articleType === "cet6") return "大学英语六级";
    if (articleType === "postgraduate1") return "考研英语一";
    if (articleType === "postgraduate2") return "考研英语二";
    return "大学英语四级";
  }

  function articleTypeGuidance(articleType) {
    if (articleType === "cet6") {
      return "六级要求：主题可以涉及社会发展、科技、文化、环境、教育、心理或公共议题；使用较丰富的词汇、固定搭配和同义表达；适当使用复杂句、长句、非谓语结构和多种逻辑连接词；文章应包含一定的分析、比较、因果或观点表达，但不能写成晦涩的学术论文。";
    }
    if (articleType === "postgraduate1") {
      return "考研英语一要求：主题可以涉及社会问题、教育、科技、文化、环境、经济或学术讨论；文章以说明、议论或分析为主，强调观点、论据和逻辑关系；使用正式书面表达，适当使用抽象名词、复杂从句、非谓语结构、插入语和长难句；段落之间应有清晰的转折、递进、因果、让步或对比关系；体现较强的逻辑密度和抽象理解要求，可以使用较高级词汇，但不要连续堆砌生僻词，避免口语化对话、简单故事和过度生活化的表达。";
    }
    if (articleType === "postgraduate2") {
      return "考研英语二要求：主题可以涉及社会生活、职场、经济管理、科技应用、教育、文化或公共议题；文章以说明、议论或实用性分析为主，内容具体、清晰、容易理解；使用正式但相对实用的书面表达；适当使用复合句和逻辑连接词，但整体复杂度低于考研英语一；可以结合实际案例、社会现象或工作生活场景展开文章；避免过度抽象、过于学术化或连续出现过长难句，重视信息获取、逻辑理解和清晰表达。";
    }
    return "四级要求：主题贴近日常生活、校园生活、社会现象、健康、环境、基础科技或文化；使用常见、实用的词汇，避免大量生僻词；句式清晰，以中等长度句子为主，可适当使用简单复合句；文章结构完整，段落之间有清晰的因果、转折或递进关系。";
  }

  function articleLengthText(length) {
    if (length === "short") return "短文，约 120 至 180 个英文单词";
    if (length === "long") return "长文，约 320 至 450 个英文单词";
    return "中等长度，约 220 至 300 个英文单词";
  }

  function responseContent(payload) {
    const choices = arrayItems(valueForKey(payload, "choices"));
    const first = choices[0];
    const message = valueForKey(first, "message");
    const content = valueForKey(message, "content") || valueForKey(first, "text");
    return typeof content === "string" ? content.trim() : "";
  }

  function parseArticleContent(content, includeTranslation) {
    const source = String(content || "").trim();
    const cleaned = source
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      const parsed = JSON.parse(cleaned);
      const article = typeof parsed.article === "string" ? parsed.article.trim() : "";
      const translation = typeof parsed.translation === "string" ? parsed.translation.trim() : "";
      if (article) return { article, translation: includeTranslation ? translation : "" };
    } catch (ignored) {
      // 模型未返回 JSON 时继续按标题分隔文本解析。
    }

    const marker = cleaned.match(/^(?:英文文章|English\s+article)\s*[:：]\s*([\s\S]*?)(?:\n\s*(?:中文翻译|Chinese\s+translation)\s*[:：]\s*([\s\S]*))?$/i);
    if (marker) {
      return {
        article: marker[1].trim(),
        translation: includeTranslation && marker[2] ? marker[2].trim() : "",
      };
    }
    return { article: cleaned, translation: "" };
  }

  function generateArticle(settings, words, options) {
    const config = normalizeSettings(settings);
    const selectedWords = normalizeReadingWords(words);
    if (selectedWords.length === 0) return Promise.reject(new Error("没有可用于生成文章的单词"));

    const readingOptions = options && typeof options === "object" ? options : {};
    const articleType = ["cet4", "cet6", "postgraduate1", "postgraduate2"].indexOf(readingOptions.articleType) >= 0
      ? readingOptions.articleType
      : "cet4";
    const length = ["short", "medium", "long"].indexOf(readingOptions.length) >= 0
      ? readingOptions.length
      : "medium";
    const includeTranslation = readingOptions.includeTranslation !== false;
    const wordText = selectedWords.map(function (word) { return word.spelling; }).join(", ");
    const translationInstruction = includeTranslation
      ? "请同时给出准确、自然的中文翻译。"
      : "不要输出中文翻译，只输出英文文章。";
    const prompt = [
      "请根据以下要求生成一篇英语考试阅读文章。",
      `考试类型：${articleTypeText(articleType)}。`,
      `文章长度：${articleLengthText(length)}。`,
      `目标单词：${wordText}。`,
      "文章必须符合指定考试的真实阅读风格，而不是教材讲解或词汇练习。",
      "每个目标单词至少使用一次；允许根据语法和语境使用目标单词的正确变形，不要为了保留某种词形而破坏文章自然性。",
      "文章应有清晰主题、完整逻辑和真实语境，不要为了强行使用单词而堆砌句子。",
      "不要直接列出单词，不要解释单词含义，不要提及目标单词、单词列表或生成过程。",
      articleTypeGuidance(articleType),
      includeTranslation
        ? "请提供忠实、自然的中文翻译，并与英文文章内容保持对应。"
        : "不要输出中文翻译，只填写空字符串。",
      "生成前请自行检查每个目标单词是否已经在文章中正确使用，但不要输出检查过程。",
      "必须只输出以下 JSON，不要使用 Markdown 代码块，不要添加任何额外说明：",
      '{"article":"英文文章内容","translation":"中文翻译内容"}',
    ].join("\n");

    return requestJSON(config, "/chat/completions", "POST", {
      model: config.model,
      messages: [
        {
          role: "system",
          content: "你是一名英语考试阅读文章生成助手，熟悉大学英语四级、六级、考研英语一和考研英语二的词汇、语法、句式与文章风格。你必须严格遵守用户指定的考试类型、文章长度、目标单词和 JSON 输出格式，不得输出额外说明。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      stream: false,
    }).then(function (payload) {
      const content = responseContent(payload);
      if (!content) throw new Error("DeepSeek 没有返回文章内容");
      const parsed = parseArticleContent(content, includeTranslation);
      if (!parsed.article) throw new Error("DeepSeek 返回的文章内容为空");
      return {
        article: parsed.article,
        translation: parsed.translation,
        words: selectedWords,
        articleType,
        length,
        includeTranslation,
        model: config.model,
      };
    });
  }

  return {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    normalizeSettings,
    testConnection,
    generateArticle,
  };
})();
