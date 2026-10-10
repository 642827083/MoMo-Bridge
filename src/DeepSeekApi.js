var __MN_DEEPSEEK_API_GLOBAL__ = (function () {
  const DEFAULT_PROVIDER = "deepseek";
  const DEFAULT_BASE_URL = "https://api.deepseek.com";
  const DEFAULT_MODEL = "deepseek-v4-flash";
  const DEEPSEEK_TEST_TIMEOUT_SECONDS = 30;
  const DEEPSEEK_GENERATION_TIMEOUT_SECONDS = 180;
  const AI_PROVIDERS = [
    { id: "mnchatai", label: "MN ChatAI", baseUrl: "", model: "当前配置模型" },
    {
      id: "deepseek",
      label: "DeepSeek",
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
    },
    {
      id: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
    {
      id: "siliconflow",
      label: "SiliconFlow",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen2.5-7B-Instruct",
    },
    {
      id: "qwen",
      label: "通义千问",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
    },
    {
      id: "zhipu",
      label: "智谱 AI",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      model: "glm-4-flash",
    },
    {
      id: "moonshot",
      label: "Kimi",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "moonshot-v1-8k",
    },
    {
      id: "custom",
      label: "自定义服务商",
      baseUrl: "",
      model: "",
    },
  ];

  function providerDefinition(provider) {
    return AI_PROVIDERS.find((item) => item.id === provider) || AI_PROVIDERS.find((item) => item.id === DEFAULT_PROVIDER);
  }

  function normalizeProvider(value) {
    const provider = typeof value === "string" ? value.trim() : "";
    return AI_PROVIDERS.some((item) => item.id === provider) ? provider : DEFAULT_PROVIDER;
  }

  function providerLabel(provider) {
    return providerDefinition(normalizeProvider(provider)).label;
  }

  function providerApiName(provider) {
    return normalizeProvider(provider) === "deepseek"
      ? "DeepSeek API"
      : `${providerLabel(provider)} API`;
  }

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

  function normalizeBaseUrl(value, provider) {
    const definition = providerDefinition(provider);
    const raw = typeof value === "string" && value.trim()
      ? value.trim()
      : definition.baseUrl;
    if (!raw) throw new Error("请填写 AI API 地址");
    if (!/^https:\/\//i.test(raw)) {
      throw new Error("AI API 地址必须使用 HTTPS");
    }
    const normalized = raw
      .replace(/\/(?:chat\/completions|models)$/i, "")
      .replace(/\/+$/, "");
    const url = NSURL.URLWithString(normalized);
    if (!url) throw new Error("AI API 地址无效");
    return normalized;
  }

  function normalizeSettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    const provider = normalizeProvider(source.provider);
    const definition = providerDefinition(provider);
    if (provider === "mnchatai") {
      return { provider, apiKey: "", baseUrl: "", model: definition.model };
    }
    return {
      provider,
      apiKey: typeof source.apiKey === "string" ? source.apiKey.trim().replace(/^Bearer\s+/i, "") : "",
      baseUrl: normalizeBaseUrl(source.baseUrl, provider),
      model: typeof source.model === "string" && source.model.trim()
        ? source.model.trim()
        : definition.model,
    };
  }

  function apiErrorMessage(payload, settings) {
    const direct = valueForKey(payload, "message");
    if (direct) return String(direct);
    const error = valueForKey(payload, "error");
    if (typeof error === "string") return error;
    const nested = valueForKey(error, "message") || valueForKey(error, "code");
    if (nested) return String(nested);
    const firstError = arrayItems(valueForKey(payload, "errors"))[0];
    const nestedError = valueForKey(firstError, "message") || valueForKey(firstError, "msg");
    if (nestedError) return String(nestedError);
    return `${providerApiName(settings && settings.provider)} 拒绝了请求`;
  }

  function requestJSON(settings, path, method, body, requestOptions) {
    let config;
    try {
      config = normalizeSettings(settings);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!config.apiKey) return Promise.reject(new Error(`请先填写 ${providerLabel(config.provider)} API Key`));

    const options = requestOptions && typeof requestOptions === "object" ? requestOptions : {};
    const timeoutSeconds = Number(options.timeoutSeconds) > 0
      ? Number(options.timeoutSeconds)
      : DEEPSEEK_GENERATION_TIMEOUT_SECONDS;
    const operationLabel = typeof options.operationLabel === "string" && options.operationLabel.trim()
      ? options.operationLabel.trim()
      : "请求";

    return new Promise(function (resolve, reject) {
      const url = NSURL.URLWithString(`${config.baseUrl}${path}`);
      if (!url) {
        reject(new Error(`${providerApiName(config.provider)} 地址无效`));
        return;
      }

      const request = NSMutableURLRequest.requestWithURL(url);
      request.setHTTPMethod(method);
      request.setTimeoutInterval(timeoutSeconds);
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
            const networkPrefix = config.provider === "deepseek"
              ? "无法连接 DeepSeek API"
              : `无法连接 ${providerApiName(config.provider)}`;
            const timeout = /timeout|timed out|超时|-1001/i.test(detail);
            const networkError = new Error(timeout
              ? `${networkPrefix}：${operationLabel}请求超时，请稍后重试`
              : detail
                ? `${networkPrefix}：${detail}`
                : `${networkPrefix}，请检查网络后重试`);
            networkError.isNetworkError = true;
            reject(networkError);
            return;
          }

          const statusCode = Number(response && response.statusCode());
          let payload = null;
          try {
            payload = isNativeNil(data) ? {} : NSJSONSerialization.JSONObjectWithDataOptions(data, 1);
          } catch (parseError) {
            reject(new Error(`${providerApiName(config.provider)} 返回了无法识别的数据`));
            return;
          }

          if (!Number.isFinite(statusCode)) {
            reject(new Error(`${providerApiName(config.provider)} 未返回有效响应`));
            return;
          }
          if (statusCode < 200 || statusCode >= 300) {
            const apiError = new Error(apiErrorMessage(payload, config));
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
    if (config.provider === "mnchatai") {
      const selection = __MN_MOMO_CHAT_AI_API_GLOBAL__.currentModel();
      return __MN_MOMO_CHAT_AI_API_GLOBAL__.ask("请仅回复 OK。", "连接测试，请只回复 OK。").then(function () {
        return { connected: true, modelAvailable: true, provider: config.provider,
          providerLabel: "MN ChatAI", model: `${selection.source}: ${selection.model}`,
          message: `连接成功，${selection.source} · ${selection.model} 可以生成文章` };
      });
    }
    if (!config.apiKey) return Promise.reject(new Error(`请先填写 ${providerLabel(config.provider)} API Key`));

    return requestJSON(config, "/chat/completions", "POST", {
      model: config.model,
      messages: [{ role: "user", content: "请只回复 OK" }],
      max_tokens: 1,
      temperature: 0,
      stream: false,
    }, {
      timeoutSeconds: DEEPSEEK_TEST_TIMEOUT_SECONDS,
      operationLabel: "测试连接",
    }).then(function () {
      return {
        connected: true,
        modelAvailable: true,
        provider: config.provider,
        providerLabel: providerLabel(config.provider),
        message: "连接成功，当前模型可以生成文章",
      };
    });
  }

  function requestCompletion(config, body, options) {
    if (config.provider === "mnchatai") {
      const selection = __MN_MOMO_CHAT_AI_API_GLOBAL__.currentModel();
      config.model = `${selection.source}: ${selection.model}`;
      const system = body.messages.filter(function (message) { return message.role === "system"; })
        .map(function (message) { return message.content; }).join("\n");
      const user = body.messages.filter(function (message) { return message.role === "user"; })
        .map(function (message) { return message.content; }).join("\n");
      return __MN_MOMO_CHAT_AI_API_GLOBAL__.ask(system, user, options);
    }
    return requestJSON(config, "/chat/completions", "POST", body, options).then(responseContent);
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

  function normalizeArticleParagraph(value, includeTranslation) {
    if (typeof value === "string") {
      const english = value.trim();
      return english ? { english, translation: "" } : null;
    }
    if (!value || typeof value !== "object") return null;
    const english = String(
      valueForKey(value, "english") || valueForKey(value, "article") || valueForKey(value, "text") || "",
    ).trim();
    const translation = includeTranslation
      ? String(valueForKey(value, "translation") || valueForKey(value, "chinese") || "").trim()
      : "";
    return english ? { english, translation } : null;
  }

  function normalizeArticleParagraphs(values, includeTranslation) {
    return arrayItems(values)
      .map(function (value) { return normalizeArticleParagraph(value, includeTranslation); })
      .filter(Boolean);
  }

  function paragraphArticleText(paragraphs) {
    return paragraphs.map(function (paragraph) { return paragraph.english; }).join("\n\n").trim();
  }

  function paragraphTranslationText(paragraphs) {
    return paragraphs
      .map(function (paragraph) { return paragraph.translation; })
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  function parseArticleContent(content, includeTranslation) {
    const source = String(content || "").trim();
    const cleaned = source
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      const parsed = JSON.parse(cleaned);
      const paragraphs = normalizeArticleParagraphs(valueForKey(parsed, "paragraphs"), includeTranslation);
      if (paragraphs.length > 0) {
        return {
          article: paragraphArticleText(paragraphs),
          translation: includeTranslation ? paragraphTranslationText(paragraphs) : "",
          paragraphs,
        };
      }
      const article = typeof parsed.article === "string" ? parsed.article.trim() : "";
      const translation = typeof parsed.translation === "string" ? parsed.translation.trim() : "";
      if (article) return { article, translation: includeTranslation ? translation : "", paragraphs: [] };
    } catch (ignored) {
      // 模型未返回 JSON 时继续按标题分隔文本解析。
    }

    const marker = cleaned.match(/^(?:英文文章|English\s+article)\s*[:：]\s*([\s\S]*?)(?:\n\s*(?:中文翻译|Chinese\s+translation)\s*[:：]\s*([\s\S]*))?$/i);
    if (marker) {
      return {
        article: marker[1].trim(),
        translation: includeTranslation && marker[2] ? marker[2].trim() : "",
        paragraphs: [],
      };
    }
    return { article: cleaned, translation: "", paragraphs: [] };
  }

  function questionOptions(value) {
    const source = value && typeof value === "object" ? value : {};
    const letters = ["A", "B", "C", "D"];
    if (Array.isArray(value)) {
      return letters.reduce(function (result, letter, index) {
        const option = value[index];
        result[letter] = typeof option === "string" ? option.trim() : "";
        return result;
      }, {});
    }
    return letters.reduce(function (result, letter) {
      const option = valueForKey(source, letter) || valueForKey(source, letter.toLowerCase());
      result[letter] = typeof option === "string" ? option.trim() : "";
      return result;
    }, {});
  }

  function normalizeQuestion(value) {
    if (!value || typeof value !== "object") return null;
    const question = String(valueForKey(value, "question") || valueForKey(value, "stem") || "").trim();
    const options = questionOptions(valueForKey(value, "options") || valueForKey(value, "choices"));
    const answerValue = String(
      valueForKey(value, "answer") || valueForKey(value, "correctAnswer") || "",
    ).trim().toUpperCase();
    const answer = answerValue.match(/[ABCD]/) ? answerValue.match(/[ABCD]/)[0] : "";
    const explanation = String(valueForKey(value, "explanation") || valueForKey(value, "analysis") || "").trim();
    if (!question || !explanation || !answer) return null;
    if (["A", "B", "C", "D"].some(function (letter) { return !options[letter]; })) return null;
    return { question, options, answer, explanation };
  }

  function parseQuestionsContent(content) {
    const source = String(content || "").trim();
    const cleaned = source
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      throw new Error("AI 返回的阅读题不是有效 JSON");
    }
    const rawQuestions = Array.isArray(parsed)
      ? parsed
      : valueForKey(parsed, "questions") || valueForKey(parsed, "items");
    const questions = arrayItems(rawQuestions)
      .map(normalizeQuestion)
      .filter(Boolean);
    if (questions.length < 3 || questions.length > 5) {
      throw new Error("AI 返回的阅读题数量应为 3 至 5 道");
    }
    return questions;
  }

  function questionTypeGuidance(articleType) {
    if (articleType === "cet6") {
      return "题目应重视段落主旨、作者观点、逻辑关系、推断和词义判断，干扰项可以有一定迷惑性，但答案必须能够从文章中找到依据。";
    }
    if (articleType === "postgraduate1") {
      return "题目应接近考研英语一阅读理解，重视主旨、作者态度、论证结构、细节推断、观点关系和语义理解，避免简单逐句翻译题。";
    }
    if (articleType === "postgraduate2") {
      return "题目应接近考研英语二阅读理解，重视文章主旨、事实细节、因果关系、态度判断和词义推断，题目清晰实用，难度低于英语一。";
    }
    return "题目应接近大学英语四级阅读理解，重视主旨、细节、推断、词义和文章结构，题干清晰，避免过度复杂的学术表达。";
  }

  function generateQuestions(settings, article, words, options) {
    const config = normalizeSettings(settings);
    const articleText = typeof article === "string" ? article.trim() : "";
    if (!articleText) return Promise.reject(new Error("没有可用于生成阅读题的文章"));

    const readingOptions = options && typeof options === "object" ? options : {};
    const articleType = ["cet4", "cet6", "postgraduate1", "postgraduate2"].indexOf(readingOptions.articleType) >= 0
      ? readingOptions.articleType
      : "postgraduate2";
    const requestedCount = Number(readingOptions.questionCount);
    const questionCount = Number.isFinite(requestedCount)
      ? Math.max(3, Math.min(5, Math.floor(requestedCount)))
      : 4;
    const selectedWords = normalizeReadingWords(words);
    const wordText = selectedWords.map(function (word) { return word.spelling; }).join(", ");
    const prompt = [
      "请根据下面的英文阅读文章生成阅读理解选择题。",
      `考试类型：${articleTypeText(articleType)}。`,
      `题目数量：${questionCount} 道。`,
      questionTypeGuidance(articleType),
      "每道题提供一个英文题干和 A、B、C、D 四个英文选项。",
      "每道题只能有一个正确答案；答案必须能从文章内容直接或合理推断得出，不得依赖文章之外的知识。",
      "选项应有合理干扰项，不要使用‘以上都对’或‘以上都不对’。",
      "explanation 字段使用简洁、准确的中文说明答案依据。",
      wordText ? `本篇文章使用的目标单词包括：${wordText}。` : "",
      "英文文章如下：",
      "--- ARTICLE START ---",
      articleText,
      "--- ARTICLE END ---",
      "必须只输出以下 JSON，不要使用 Markdown 代码块，不要添加任何额外说明：",
      '{"questions":[{"question":"英文题干","options":{"A":"选项 A","B":"选项 B","C":"选项 C","D":"选项 D"},"answer":"A","explanation":"中文解析"}]}'
    ].filter(Boolean).join("\n");

    return requestCompletion(config, {
      model: config.model,
      messages: [
        {
          role: "system",
          content: "你是一名英语考试阅读理解命题助手，必须根据给定文章和考试类型生成规范的选择题，并严格返回 JSON。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      stream: false,
    }, {
      timeoutSeconds: DEEPSEEK_GENERATION_TIMEOUT_SECONDS,
      operationLabel: "生成阅读题",
      requestToken: readingOptions.requestToken,
    }).then(function (content) {
      if (!content) throw new Error(`${providerLabel(config.provider)} 没有返回阅读题内容`);
      const questions = parseQuestionsContent(content);
      return {
        questions,
        words: selectedWords,
        articleType,
        questionCount: questions.length,
        provider: config.provider,
        providerLabel: providerLabel(config.provider),
        model: config.model,
      };
    });
  }

  function generateArticle(settings, words, options) {
    const config = normalizeSettings(settings);
    const selectedWords = normalizeReadingWords(words);
    if (selectedWords.length === 0) return Promise.reject(new Error("没有可用于生成文章的单词"));

    const readingOptions = options && typeof options === "object" ? options : {};
    const articleType = ["cet4", "cet6", "postgraduate1", "postgraduate2"].indexOf(readingOptions.articleType) >= 0
      ? readingOptions.articleType
      : "postgraduate2";
    const length = ["short", "medium", "long"].indexOf(readingOptions.length) >= 0
      ? readingOptions.length
      : "medium";
    const includeTranslation = readingOptions.includeTranslation !== false;
    const wordText = selectedWords.map(function (word) { return word.spelling; }).join(", ");
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
        ? "请将文章分成自然的多个段落，并为每个英文段落提供忠实、自然且一一对应的中文翻译。"
        : "请将文章分成自然的多个段落，每个段落的 translation 字段填写空字符串。",
      "生成前请自行检查每个目标单词是否已经在文章中正确使用，但不要输出检查过程。",
      "必须只输出以下 JSON，不要使用 Markdown 代码块，不要添加任何额外说明：",
      '{"paragraphs":[{"english":"英文第一段","translation":"第一段中文翻译"},{"english":"英文第二段","translation":"第二段中文翻译"}]}',
    ].join("\n");

    return requestCompletion(config, {
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
    }, {
      timeoutSeconds: DEEPSEEK_GENERATION_TIMEOUT_SECONDS,
      operationLabel: "生成文章",
      requestToken: readingOptions.requestToken,
    }).then(function (content) {
      if (!content) throw new Error(`${providerLabel(config.provider)} 没有返回文章内容`);
      const parsed = parseArticleContent(content, includeTranslation);
      if (!parsed.article) throw new Error(`${providerLabel(config.provider)} 返回的文章内容为空`);
      return {
        article: parsed.article,
        translation: parsed.translation,
        paragraphs: parsed.paragraphs,
        words: selectedWords,
        articleType,
        length,
        includeTranslation,
        provider: config.provider,
        providerLabel: providerLabel(config.provider),
        model: config.model,
      };
    });
  }

  return {
    DEFAULT_PROVIDER,
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    AI_PROVIDERS,
    providerDefinition,
    providerLabel,
    normalizeSettings,
    testConnection,
    generateArticle,
    generateQuestions,
    parseQuestionsContent,
  };
})();
