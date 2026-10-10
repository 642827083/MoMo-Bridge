var __MN_MOMO_CHAT_AI_API_GLOBAL__ = (function () {
  let activeTask = null;

  function modelApi() {
    if (typeof MNUtil === "undefined" || !MNUtil || typeof MNUtil.delay !== "function") {
      throw new Error("请安装并启用 MN Utils 后使用 MN ChatAI");
    }
    if (typeof chatAIConfig === "undefined" || !chatAIConfig || !chatAIConfig.config
      || typeof chatAIConfig.allSource !== "function" || typeof chatAIConfig.modelNames !== "function"
      || typeof chatAIConfig.getDefaultModel !== "function" || typeof chatAIConfig.setDefaultModel !== "function") {
      throw new Error("请安装并启用 MN ChatAI 0.3.1 或更新版本，模型接口不可用");
    }
    return chatAIConfig;
  }

  function currentModel() {
    const config = modelApi();
    const source = config.config.source;
    const model = config.getDefaultModel(source);
    if (typeof source !== "string" || typeof model !== "string" || !model.trim()) {
      throw new Error("MN ChatAI 尚未配置有效模型，请刷新模型列表或在 MN ChatAI 中完成配置");
    }
    return { source, model: model.trim() };
  }

  function getModels() {
    const config = modelApi();
    const source = config.config.source;
    const current = config.getDefaultModel(source);
    const sources = config.allSource(true, true).map(function (value) {
      const names = config.modelNames(value, true);
      const models = (Array.isArray(names) ? names : []).map(function (name, index) {
        return typeof name === "string" && name.trim()
          ? { value: value === "Built-in" ? String(index) : name.trim(), label: name.trim() } : null;
      }).filter(Boolean);
      const defaultModel = config.getDefaultModel(value);
      if (value !== "Built-in" && typeof defaultModel === "string" && defaultModel.trim()
        && !models.some(function (item) { return item.value === defaultModel.trim(); })) {
        models.push({ value: defaultModel.trim(), label: defaultModel.trim() });
      }
      return { value, label: value === "Built-in" ? "内置模型" : value, models };
    }).filter(function (item) { return item.models.length > 0; });
    return { sources, source: typeof source === "string" ? source : "",
      model: source === "Built-in" ? String(config.config.tunnel) : (typeof current === "string" ? current.trim() : ""),
      currentSource: typeof source === "string" ? source : "", currentModel: typeof current === "string" ? current.trim() : "" };
  }

  function selectModel(source, model) {
    if (activeTask || (typeof chatAIUtils !== "undefined" && chatAIUtils
      && (chatAIUtils.notifyController && chatAIUtils.notifyController.connection
        || typeof chatAIUtils.actionAfterResponse === "function"))) {
      throw new Error("MN ChatAI 正在生成，请完成或暂停后再切换模型");
    }
    const config = modelApi();
    const catalog = getModels();
    const provider = catalog.sources.find(function (item) { return item.value === source; });
    if (!provider || !provider.models.some(function (item) { return item.value === model; })) {
      throw new Error("所选 MN ChatAI 模型不可用，请刷新模型列表后重新选择");
    }
    // 内置模型通过渠道索引选择，其他服务商使用作者的默认模型保存方法。
    if (source === "Built-in") config.config.tunnel = Number(model);
    config.setDefaultModel(source, source === "Built-in" ? undefined : model, true);
    return getModels();
  }

  function releaseController(task) {
    if (task.api.notifyController === task.controller) {
      task.api.notifyController = task.previousController;
    }
    // 不调用 hide()：作者的关闭流程会取消请求并清空响应。
    try {
      task.controller.view.hidden = true;
      task.controller.view.removeFromSuperview();
    } catch (ignored) { console.log("MoMo Bridge: 隐藏生成视图未能完全移除"); }
  }

  function finish(task, error, text) {
    if (task.settled) return;
    task.settled = true;
    if (task.api.actionAfterResponse === task.callback) delete task.api.actionAfterResponse;
    releaseController(task);
    if (activeTask === task) activeTask = null;
    if (error) task.reject(error);
    else task.resolve(text);
  }

  async function stop(task, error) {
    task.cancelRequested = true;
    try {
      // 等待启动过程退出，防止暂停后旧的启动流程才发出网络请求。
      await task.initialization;
      if (task.settled) return;
      if (task.api.actionAfterResponse === task.callback && task.controller.connection) {
        await task.controller.stopOutput();
        if (task.controller.connection) throw new Error("MN ChatAI 未能停止输出，请稍后重试暂停");
      }
      finish(task, error);
    } catch (stopError) {
      task.cancelRequested = false;
      if (!task.settled) watch(task, 0, 0);
      throw stopError;
    }
  }

  function watch(task, ticks, idleTicks) {
    if (task.settled) return;
    Promise.resolve().then(function () { return MNUtil.delay(0.25); }).then(function () {
      if (task.settled || task.cancelRequested) return;
      const connection = task.controller.connection;
      if (connection) task.started = true;
      const idle = connection ? 0 : idleTicks + 1;
      let message = "";
      if (!task.completing && !task.started && ticks >= 20) {
        message = "MN ChatAI 未启动生成，请检查其模型配置及额度后重试";
      } else if (!task.completing && task.started && !connection && idle >= 8) {
        message = Number(task.controller.statusCode) >= 400
          ? `MN ChatAI 请求失败（HTTP ${Number(task.controller.statusCode)}），请检查模型配置及额度`
          : "MN ChatAI 已结束或中断，但未返回文章，请重试";
      } else if (ticks >= 2400) {
        message = "MN ChatAI 生成超时，已停止本次请求，可以重新生成";
      }
      if (message) return stop(task, new Error(message));
      watch(task, ticks + 1, idle);
    }).catch(function (error) { finish(task, error); });
  }

  function ask(system, user, options) {
    if (typeof MNUtil === "undefined" || !MNUtil || typeof MNUtil.delay !== "function") {
      return Promise.reject(new Error("请安装并启用 MN Utils 后使用 MN ChatAI"));
    }
    if (typeof chatAIUtils === "undefined" || !chatAIUtils || typeof chatAIUtils.ask !== "function") {
      return Promise.reject(new Error("请安装并启用 MN ChatAI 0.3.1 或更新版本，并在其中配置模型"));
    }
    if (activeTask) return Promise.reject(new Error("MN ChatAI 的上一次请求尚未结束，请先暂停生成后重试"));
    const api = chatAIUtils;
    let controller;
    let previousController;
    try {
      if (typeof api.ensureNotifyController !== "function" || typeof notificationController === "undefined"
        || !notificationController || typeof notificationController.new !== "function") {
        throw new Error("MN ChatAI 后台生成接口不兼容，请更新至 0.3.1 或更新版本");
      }
      previousController = api.notifyController;
      if (previousController && previousController.connection || typeof api.actionAfterResponse === "function") {
        throw new Error("MN ChatAI 正在处理其他请求，请在其窗口结束后重试");
      }
      // 仅替换本次请求的控制器，不修改作者原有控制器或全局原型。
      // 保留公共 ask 的鉴权、额度检查及流式协议，阻止本次控制器显示浮窗。
      controller = notificationController.new();
      if (!controller || !controller.view || typeof controller.stopOutput !== "function"
        || typeof controller.show !== "function" || typeof controller.baseAsk !== "function"
        || typeof controller.preCheck !== "function" || typeof chatAIConfig === "undefined"
        || typeof chatAIConfig.getConfigFromSource !== "function"
        || typeof controller.view.removeFromSuperview !== "function") {
        throw new Error("MN ChatAI 后台生成控制器未正确初始化");
      }
      // 固定本次模型配置，避免外部面板在提示词渲染期间切换默认模型。
      const requestConfig = chatAIConfig.getConfigFromSource();
      if (!requestConfig || !requestConfig.model) throw new Error("MN ChatAI 尚未配置有效模型");
      const baseAsk = controller.baseAsk;
      const preCheck = controller.preCheck;
      controller.baseAsk = function (question, ignoredConfig, temperature) {
        return baseAsk.call(this, question, requestConfig, temperature);
      };
      controller.preCheck = function () { return preCheck.call(this, requestConfig.isBuiltIn); };
      controller.view.hidden = true;
      controller.show = function () { this.view.hidden = true; };
      controller.notShow = false;
      controller.called = true;
    } catch (error) {
      if (controller && controller.view) {
        controller.view.hidden = true;
        if (typeof controller.view.removeFromSuperview === "function") controller.view.removeFromSuperview();
      }
      return Promise.reject(error);
    }

    return new Promise(function (resolve, reject) {
      const task = { api, controller, previousController, resolve, reject, settled: false, cancelRequested: false,
        started: false, requestToken: options && options.requestToken || "" };
      activeTask = task;
      api.notifyController = controller;
      // 先登记本次完成回调；ask(..., false) 不创建无法取消的第三方等待 Promise。
      task.callback = function () {
        if (task.settled || task.cancelRequested) return Promise.resolve();
        task.completing = true;
        // 完成回调之后作者会同步清空 response，必须在回调入口立刻捕获原始文本。
        const response = controller.response;
        return Promise.resolve(response).then(function (text) {
          if (task.cancelRequested) return;
          if (typeof text !== "string" || !text.trim()) {
            throw new Error("MN ChatAI 未返回文本，请检查其模型配置和生成状态后重试");
          }
          finish(task, null, text.trim());
        }).catch(function (error) { finish(task, error); });
      };
      api.actionAfterResponse = task.callback;
      task.initialization = Promise.resolve().then(function () {
        if (task.cancelRequested) return;
        return api.ask({ system, user, forceToExecute: false }, false);
      }).then(function () {
        // 作者窗口初始化包含两次 0.01 秒原生延迟，待其退出后才允许停止与重试。
        return MNUtil.delay(0.05);
      });
      task.initialization.then(function () {
        if (!task.settled && !task.cancelRequested) watch(task, 0, 0);
      }).catch(function (error) { finish(task, error); });
    });
  }

  async function cancel(requestToken) {
    const task = activeTask;
    if (!task || !requestToken || task.requestToken !== requestToken) return { cancelled: false };
    await stop(task, new Error("已暂停本次生成"));
    return { cancelled: true };
  }

  return { ask, cancel, getModels, selectModel, currentModel };
})();
