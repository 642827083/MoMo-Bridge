import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const adapterSource = await readFile(new URL("../src/MnChatAiApi.js", import.meta.url), "utf8");
const generationSource = await readFile(new URL("../src/DeepSeekApi.js", import.meta.url), "utf8");
const bridgeSource = await readFile(new URL("../src/WebBridgeCommands.js", import.meta.url), "utf8");

function controllablePlugin() {
  let finish;
  let stops = 0;
  let calls = 0;
  const controller = { notShow: true, called: false, connection: null,
    async stopOutput() { stops += 1; this.connection = null; } };
  let hiddenController;
  const plugin = { notifyController: controller, ensureNotifyController() {},
    async getCurrentResponse() { return controller.text; },
    async ask(options, wait) {
      calls += 1;
      const target = plugin.notifyController;
      if (target.notShow && !target.called) return new Promise(() => {});
      target.show();
      target.connection = {};
      if (wait) return new Promise((resolve) => { finish = resolve; });
      finish = async (text) => {
        target.response = text;
        target.connection = null;
        const callback = plugin.actionAfterResponse;
        const completing = callback?.();
        target.response = "";
        if (plugin.actionAfterResponse === callback) delete plugin.actionAfterResponse;
        await completing;
      };
    } };
  plugin.createController = () => {
    hiddenController = { response: "", view: { hidden: true, removed: false,
      removeFromSuperview() { this.removed = true; } }, show() { this.view.hidden = false; },
      baseAsk() {}, preCheck() { return true; },
      stopOutput() { return controller.stopOutput.call(this); } };
    return hiddenController;
  };
  return { plugin, controller, get hiddenController() { return hiddenController; },
    finish: (text) => finish(text), get stops() { return stops; }, get calls() { return calls; } };
}

function modelConfig() {
  const config = { source: "Deepseek", tunnel: 0, deepseekModel: "test-model-1", customModel: "custom-model",
    saved: 0, privateKey: "synthetic-secret-never-return" };
  return { config, allSource: () => ["Built-in", "Deepseek", "Custom"],
    getConfigFromSource() { return { source: config.source, model: this.getDefaultModel(), isBuiltIn: config.source === "Built-in" }; },
    modelNames: (source) => source === "Built-in" ? ["free-model-1", "free-model-2"]
      : source === "Deepseek" ? ["test-model-1", "test-model-2"] : ["custom-model"],
    getDefaultModel(source = config.source) {
      return source === "Built-in" ? this.modelNames(source)[config.tunnel]
        : source === "Deepseek" ? config.deepseekModel : config.customModel;
    },
    setDefaultModel(source, model, save) {
      config.source = source;
      if (source === "Deepseek") config.deepseekModel = model;
      if (source === "Custom") config.customModel = model;
      if (save) config.saved += 1;
    } };
}

function runtime(globals = {}) {
  const values = new Map();
  const context = {
    MNUtil: { delay: (seconds) => seconds <= 0.05 ? Promise.resolve() : new Promise(() => {}) },
    NSUserDefaults: { standardUserDefaults: () => ({
      objectForKey: (key) => values.get(key),
      setObjectForKey: (value, key) => values.set(key, value),
    }) },
    chatAIConfig: modelConfig(),
    ...globals,
  };
  // 模拟作者的启动返回值与独立完成通知，而非假定 ask(false) 返回生成文本。
  const plugin = context.chatAIUtils;
  if (plugin && typeof plugin.ask === "function" && !plugin.ensureNotifyController) {
    const generate = plugin.ask;
    plugin.notifyController = { connection: null, async stopOutput() { this.connection = null; } };
    plugin.ensureNotifyController = () => {};
    plugin.getCurrentResponse = async () => {
      if (plugin.responseError) throw plugin.responseError;
      return plugin.response;
    };
    plugin.ask = (options, wait) => {
      const target = plugin.notifyController;
      target.show();
      target.connection = {};
      const callback = plugin.actionAfterResponse;
      Promise.resolve().then(() => generate(options, wait)).then((text) => {
        target.response = text;
        target.connection = null;
        const completion = callback?.();
        target.response = "";
        return completion;
      }, (error) => {
        plugin.responseError = error;
        target.connection = null;
        return callback?.();
      });
      return Promise.resolve();
    };
  }
  if (plugin && !context.notificationController) {
    context.notificationController = { new: () => plugin.createController ? plugin.createController() : {
      response: "", view: { hidden: true, removeFromSuperview() {} }, show() { this.view.hidden = false; },
      baseAsk() {}, preCheck() { return true; },
      async stopOutput() { this.connection = null; },
    } };
  }
  vm.createContext(context);
  for (const source of [adapterSource, generationSource, bridgeSource]) vm.runInContext(source, context);
  return { api: context.__MN_DEEPSEEK_API_GLOBAL__, adapter: context.__MN_MOMO_CHAT_AI_API_GLOBAL__,
    commands: context.__MN_WEB_BRIDGE_COMMANDS_GLOBAL__.commands, context, values };
}

test("MN ChatAI generates paragraphs through its public ask API without HTTP credentials", async () => {
  let call;
  const { api } = runtime({ chatAIUtils: { ask: async (...args) => {
    call = args;
    return JSON.stringify({ paragraphs: [{ english: "A resilient community grows.", translation: "坚韧的社区不断成长。" }] });
  } } });
  const result = await api.generateArticle({ provider: "mnchatai", apiKey: "unused-secret", baseUrl: "invalid" },
    ["resilient"], { articleType: "cet6", length: "short" });
  assert.equal(call[1], false);
  assert.equal(call[0].forceToExecute, false);
  assert.match(call[0].system, /阅读文章生成助手/);
  assert.match(call[0].user, /resilient/);
  assert.match(call[0].user, /大学英语六级/);
  assert.match(call[0].user, /120 至 180/);
  assert.doesNotMatch(JSON.stringify(call), /unused-secret/);
  assert.equal(result.provider, "mnchatai");
  assert.equal(result.model, "Deepseek: test-model-1");
  assert.equal(result.article, "A resilient community grows.");
  assert.equal(result.translation, "坚韧的社区不断成长。");
  assert.equal(result.paragraphs.length, 1);
});

test("MN ChatAI connection test and questions reuse the configured plugin", async () => {
  const questions = Array.from({ length: 4 }, (_, i) => ({ question: `Question ${i}?`,
    options: { A: "a", B: "b", C: "c", D: "d" }, answer: "B", explanation: "依据正文。" }));
  const calls = [];
  const { api } = runtime({ chatAIUtils: { ask: async (options) => {
    calls.push(options);
    return calls.length === 1 ? "OK" : JSON.stringify({ questions });
  } } });
  assert.equal((await api.testConnection({ provider: "mnchatai" })).connected, true);
  const result = await api.generateQuestions({ provider: "mnchatai" }, "Test article.", ["test"], {});
  assert.equal(result.questions.length, 4);
  assert.match(calls[1].user, /Test article\./);
});

test("MN ChatAI selection survives native settings persistence and saves generated history", async () => {
  let recorded;
  const { commands, api } = runtime({ chatAIUtils: { ask: async () => '{"article":"Test article."}' },
    __MN_MOMO_READING_HISTORY_GLOBAL__: { recordArticle: (input, result) => {
      recorded = result; return { id: "history-1", ...result };
    } } });
  commands.saveAiSettings({}, { provider: "mnchatai" });
  assert.equal(commands.getAiSettings().provider, "mnchatai");
  assert.equal(api.normalizeSettings({ provider: "mnchatai" }).apiKey, "");
  assert.equal(api.providerDefinition("unknown").id, "deepseek");
  const result = await commands.generateTodayReading({}, { words: ["test"] });
  assert.equal(result.historyEntry.id, "history-1");
  assert.equal(recorded.provider, "mnchatai");
});

test("Missing dependencies and empty, malformed or rejected plugin responses produce useful errors", async () => {
  for (const [globals, expected] of [
    [{ MNUtil: undefined }, /MN Utils/],
    [{}, /安装并启用 MN ChatAI/],
    [{ chatAIUtils: { ask: async () => undefined } }, /未返回文本/],
    [{ chatAIUtils: { ask: async () => ({ text: "wrong format" }) } }, /未返回文本/],
    [{ chatAIUtils: { ask: async () => { throw new Error("plugin error"); } } }, /未返回文本/],
  ]) {
    await assert.rejects(runtime(globals).adapter.ask("system", "user"), expected);
  }
});

test("Concurrent requests cannot replace the plugin's shared completion callback", async () => {
  let finish;
  let calls = 0;
  const { adapter } = runtime({ chatAIUtils: { ask: () => {
    calls += 1; return new Promise((resolve) => { finish = resolve; });
  } } });
  const first = adapter.ask("s", "u");
  await assert.rejects(adapter.ask("s", "u"), /上一次请求尚未结束/);
  finish("first");
  assert.equal(await first, "first");
  const second = adapter.ask("s", "u");
  await new Promise(setImmediate);
  finish("second");
  assert.equal(await second, "second");
  assert.equal(calls, 2);
});

test("A timeout stops the plugin output, releases the lock and permits retry", async () => {
  let ticks = 0;
  const fixture = controllablePlugin();
  const { adapter } = runtime({ MNUtil: { delay: (seconds) => {
    if (seconds <= 0.05) return Promise.resolve();
    ticks += 1;
    return ticks <= 2401 ? Promise.resolve() : new Promise(() => {});
  } }, chatAIUtils: fixture.plugin });
  await assert.rejects(adapter.ask("s", "u", { requestToken: "timeout" }), /生成超时/);
  assert.equal(fixture.stops, 1);
  const next = adapter.ask("s", "u", { requestToken: "new" });
  await new Promise(setImmediate);
  await fixture.finish("new response");
  assert.equal(await next, "new response");
});

test("API Key clipboard reads are explicit and do not persist credentials", () => {
  let reads = 0;
  const { commands, values } = runtime({ MNUtil: { get clipboardText() { reads += 1; return "  example-key  "; } } });
  assert.equal(reads, 0);
  assert.equal(commands.getAiKeyClipboard().text, "example-key");
  assert.equal(reads, 1);
  assert.equal(values.size, 0);
});

test("Direct API providers continue sending completions over the native HTTP transport", async () => {
  let request;
  const { api } = runtime({
    NSURL: { URLWithString: (value) => value },
    NSMutableURLRequest: { requestWithURL: (url) => {
      request = { url, setHTTPMethod(method) { this.method = method; },
        setTimeoutInterval(seconds) { this.timeout = seconds; },
        setAllHTTPHeaderFields(headers) { this.headers = headers; },
        setHTTPBody(body) { this.body = body; } };
      return request;
    } },
    NSJSONSerialization: { dataWithJSONObjectOptions: (data) => data,
      JSONObjectWithDataOptions: (data) => data },
    NSOperationQueue: { mainQueue: () => ({}) },
    NSURLConnection: { sendAsynchronousRequestQueueCompletionHandler: (request, queue, callback) => {
      callback({ statusCode: () => 200 }, { choices: [{ message: { content: '{"article":"Direct test article."}' } }] }, null);
    } },
  });
  const result = await api.generateArticle({ provider: "deepseek", apiKey: "synthetic-direct-key" }, ["test"], {});
  assert.equal(result.article, "Direct test article.");
  assert.equal(result.provider, "deepseek");
  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer synthetic-direct-key");
  assert.equal(request.body.stream, false);
  assert.equal(request.body.messages.length, 2);
});

test("A separate hidden controller receives raw output and restores the original window", async () => {
  const fixture = controllablePlugin();
  const { adapter } = runtime({ chatAIUtils: fixture.plugin });
  const promise = adapter.ask("s", "u", { requestToken: "first" });
  await new Promise(setImmediate);
  assert.equal(fixture.controller.notShow, true);
  assert.equal(fixture.controller.called, false);
  assert.equal(fixture.hiddenController.called, true);
  assert.equal(fixture.hiddenController.view.hidden, true);
  await fixture.finish("generated");
  assert.equal(await promise, "generated");
  assert.equal(fixture.plugin.notifyController, fixture.controller);
  assert.equal(fixture.hiddenController.view.removed, true);
});

test("Pausing settles the native reading request and permits a fresh generation", async () => {
  const fixture = controllablePlugin();
  const { adapter } = runtime({ chatAIUtils: fixture.plugin });
  const first = adapter.ask("s", "u", { requestToken: "first" });
  const rejected = assert.rejects(first, /暂停/);
  await new Promise(setImmediate);
  await adapter.cancel("first");
  await rejected;
  assert.equal(fixture.stops, 1);
  assert.equal(fixture.plugin.notifyController, fixture.controller);
  assert.equal(fixture.hiddenController.view.removed, true);
  const second = adapter.ask("s", "u", { requestToken: "second" });
  await new Promise(setImmediate);
  await fixture.finish("fresh article");
  assert.equal(await second, "fresh article");
});

test("A refused startup fails promptly and does not leave a permanent request lock", async () => {
  const fixture = controllablePlugin();
  const original = fixture.plugin.ask;
  fixture.plugin.ask = async () => {};
  let ticks = 0;
  const { adapter } = runtime({ chatAIUtils: fixture.plugin,
    MNUtil: { delay: (seconds) => seconds <= 0.05 || ++ticks <= 21 ? Promise.resolve() : new Promise(() => {}) } });
  await assert.rejects(adapter.ask("s", "u", { requestToken: "failed" }), /未启动生成/);
  assert.equal(fixture.plugin.actionAfterResponse, undefined);
  fixture.plugin.ask = original;
  const next = adapter.ask("s", "u", { requestToken: "next" });
  await new Promise(setImmediate);
  await fixture.finish("retry article");
  assert.equal(await next, "retry article");
});

test("Cancelled results and stale cancellation commands cannot affect the new task or history", async () => {
  const fixture = controllablePlugin();
  const history = [];
  const { commands } = runtime({ chatAIUtils: fixture.plugin,
    __MN_MOMO_READING_HISTORY_GLOBAL__: { recordArticle: (input, result) => {
      history.push(result); return { id: "history-1", ...result };
    } } });
  const input = { settings: { provider: "mnchatai" }, words: ["test"], requestToken: "old" };
  const first = commands.generateTodayReading({}, input);
  const rejected = assert.rejects(first, /暂停/);
  await new Promise(setImmediate);
  const oldCallback = fixture.plugin.actionAfterResponse;
  await commands.cancelAiReadingGeneration({}, { requestToken: "old" });
  await rejected;
  assert.equal(history.length, 0);
  const next = commands.generateTodayReading({}, { ...input, requestToken: "new" });
  await new Promise(setImmediate);
  const newCallback = fixture.plugin.actionAfterResponse;
  assert.equal((await commands.cancelAiReadingGeneration({}, { requestToken: "old" })).cancelled, false);
  await oldCallback();
  assert.equal(fixture.plugin.actionAfterResponse, newCallback);
  assert.equal(history.length, 0);
  await fixture.finish('{"article":"Fresh article."}');
  assert.equal((await next).article, "Fresh article.");
  assert.equal(history.length, 1);
});

test("Other ChatAI requests are not stopped or overwritten by this addon", async () => {
  const fixture = controllablePlugin();
  const otherCallback = () => {};
  fixture.controller.connection = {};
  fixture.plugin.actionAfterResponse = otherCallback;
  const { adapter } = runtime({ chatAIUtils: fixture.plugin });
  await assert.rejects(adapter.ask("s", "u", { requestToken: "ours" }), /其他请求/);
  assert.equal((await adapter.cancel("ours")).cancelled, false);
  assert.equal(fixture.stops, 0);
  assert.equal(fixture.plugin.actionAfterResponse, otherCallback);
});

test("Cancelling immediately prevents the queued startup from sending a request", async () => {
  const fixture = controllablePlugin();
  const { adapter } = runtime({ chatAIUtils: fixture.plugin });
  const first = adapter.ask("s", "u", { requestToken: "early" });
  const rejected = assert.rejects(first, /暂停/);
  await adapter.cancel("early");
  await rejected;
  assert.equal(fixture.calls, 0);
  assert.equal(fixture.plugin.actionAfterResponse, undefined);
});

test("A failed stop retains result handling so a later completion releases the task", async () => {
  const fixture = controllablePlugin();
  fixture.controller.stopOutput = async () => { throw new Error("stop failed"); };
  const { adapter } = runtime({ chatAIUtils: fixture.plugin });
  const first = adapter.ask("s", "u", { requestToken: "first" });
  await new Promise(setImmediate);
  await assert.rejects(adapter.cancel("first"), /stop failed/);
  await fixture.finish("completed after stop failure");
  assert.equal(await first, "completed after stop failure");
  const next = adapter.ask("s", "u", { requestToken: "second" });
  await new Promise(setImmediate);
  await fixture.finish("retry article");
  assert.equal(await next, "retry article");
});

test("Model catalogs exclude credentials and saving changes the effective model and reading history", async () => {
  const saved = [];
  const { commands, adapter, context, values } = runtime({ chatAIUtils: { ask: async () => '{"article":"Selected model article."}' },
    __MN_MOMO_READING_HISTORY_GLOBAL__: { recordArticle: (input, result) => {
      saved.push(result); return { id: "selected-1", ...result };
    } } });
  const catalog = commands.getMnChatAiModels();
  assert.equal(catalog.currentModel, "test-model-1");
  assert.doesNotMatch(JSON.stringify(catalog), /synthetic-secret|privateKey/);
  const result = commands.saveAiSettings({}, { provider: "mnchatai", mnChatAiSource: "Deepseek", mnChatAiModel: "test-model-2" });
  assert.equal(result.mnChatAiSelection.currentModel, "test-model-2");
  assert.equal(context.chatAIConfig.config.saved, 1);
  assert.equal(adapter.currentModel().model, "test-model-2");
  await commands.generateTodayReading({}, { words: ["selected"] });
  assert.equal(saved[0].model, "Deepseek: test-model-2");
  assert.doesNotMatch(JSON.stringify([...values.values()]), /synthetic-secret|privateKey|sources/);
});

test("Built-in model selection uses the channel index and persists through the author's save method", () => {
  const { adapter, context } = runtime();
  const catalog = adapter.selectModel("Built-in", "1");
  assert.equal(context.chatAIConfig.config.source, "Built-in");
  assert.equal(context.chatAIConfig.config.tunnel, 1);
  assert.equal(context.chatAIConfig.config.saved, 1);
  assert.equal(catalog.model, "1");
  assert.equal(catalog.currentModel, "free-model-2");
});

test("Invalid or busy model selections cannot change either plugin's saved configuration", async () => {
  const fixture = controllablePlugin();
  const { commands, adapter, context, values } = runtime({ chatAIUtils: fixture.plugin });
  assert.throws(() => commands.saveAiSettings({}, { provider: "mnchatai", mnChatAiSource: "unknown", mnChatAiModel: "wrong" }), /不可用/);
  assert.equal(values.size, 0);
  assert.equal(context.chatAIConfig.config.saved, 0);
  const generating = adapter.ask("s", "u", { requestToken: "busy" });
  await new Promise(setImmediate);
  assert.throws(() => adapter.selectModel("Custom", "custom-model"), /正在生成/);
  assert.equal(context.chatAIConfig.config.saved, 0);
  await fixture.finish("finished");
  await generating;
  assert.equal(adapter.selectModel("Custom", "custom-model").currentSource, "Custom");
});

test("Incompatible silent generation fails explicitly without opening the existing window", async () => {
  const fixture = controllablePlugin();
  const { adapter } = runtime({ chatAIUtils: fixture.plugin, notificationController: {} });
  await assert.rejects(adapter.ask("s", "u"), /后台生成接口不兼容/);
  assert.equal(fixture.plugin.notifyController, fixture.controller);
  assert.equal(fixture.calls, 0);
});

test("Changing the external default during startup cannot change this request's model or quota check", async () => {
  const fixture = controllablePlugin();
  let requested;
  let checked;
  const create = fixture.plugin.createController;
  fixture.plugin.createController = () => {
    const controller = create();
    controller.baseAsk = (messages, config) => { requested = config; };
    controller.preCheck = (isBuiltIn) => { checked = isBuiltIn; return true; };
    return controller;
  };
  const generate = fixture.plugin.ask;
  fixture.plugin.ask = async (options, wait) => {
    const controller = fixture.plugin.notifyController;
    controller.preCheck(true);
    controller.baseAsk([{ role: "user", content: options.user }]);
    return generate(options, wait);
  };
  const { adapter, context } = runtime({ chatAIUtils: fixture.plugin });
  const pending = adapter.ask("s", "u");
  context.chatAIConfig.config.source = "Built-in";
  await new Promise(setImmediate);
  assert.equal(requested.source, "Deepseek");
  assert.equal(requested.model, "test-model-1");
  assert.equal(checked, false);
  await fixture.finish("fixed model response");
  assert.equal(await pending, "fixed model response");
});
