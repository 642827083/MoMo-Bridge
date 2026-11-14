import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/MomoApi.js", import.meta.url), "utf8");

const example = {
  word: "merits",
  lemma: "merit",
  phrase: "We should judge the proposal on its merits.",
  interpretation: "我们应该根据这项提议本身的优点来评判它。",
  origin: "",
};

function createMomoRuntime({ vocabularyIds, initialPhrases = {}, failedPhraseIds = [] }) {
  const phrases = {};
  for (const [id, items] of Object.entries(initialPhrases)) {
    phrases[id] = items.map((item) => ({ ...item }));
  }

  const context = {
    Date,
    JSON,
    Math,
    Promise,
    Object,
    Array,
    String,
    Number,
    RegExp,
    Error,
    encodeURIComponent,
    setTimeout(resolve) {
      resolve();
    },
    NSURL: {
      URLWithString(value) {
        return value;
      },
    },
    NSMutableURLRequest: {
      requestWithURL(url) {
        return {
          url,
          method: "GET",
          body: undefined,
          setHTTPMethod(method) {
            this.method = method;
          },
          setTimeoutInterval() {},
          setAllHTTPHeaderFields() {},
          setHTTPBody(body) {
            this.body = body;
          },
        };
      },
    },
    NSJSONSerialization: {
      dataWithJSONObjectOptions(value) {
        return value;
      },
      JSONObjectWithDataOptions(value) {
        return value;
      },
    },
    NSOperationQueue: {
      mainQueue() {
        return {};
      },
    },
    NSURLConnection: {
      sendAsynchronousRequestQueueCompletionHandler(request, queue, callback) {
        const url = new URL(request.url);
        const path = url.pathname.replace("/open/api/v1", "");
        const response = { statusCode: () => 200 };

        if (path === "/vocabulary/query" && request.method === "POST") {
          const voc = Object.entries(vocabularyIds).map(([spelling, id]) => ({ spelling, id }));
          callback(response, { voc }, null);
          return;
        }

        if (path === "/phrases" && request.method === "GET") {
          const id = url.searchParams.get("voc_id");
          callback(response, { phrases: phrases[id] || [] }, null);
          return;
        }

        if (path === "/phrases" && request.method === "POST") {
          const value = request.body.phrase;
          if (failedPhraseIds.includes(String(value.voc_id))) {
            callback({ statusCode: () => 500 }, { message: "例句提交失败" }, null);
            return;
          }
          if (!phrases[value.voc_id]) phrases[value.voc_id] = [];
          phrases[value.voc_id].push({
            phrase: value.phrase,
            interpretation: value.interpretation,
          });
          callback(response, {}, null);
          return;
        }

        callback({ statusCode: () => 404 }, { message: "not found" }, null);
      },
    },
  };

  vm.runInNewContext(source, context);
  return context.__MN_MOMO_API_GLOBAL__;
}

async function importOneExample(runtime) {
  const result = await runtime.importWords("token", "", ["merit"], [example], {
    addWords: false,
    addExamples: true,
    addStudy: false,
  });
  return result.examples;
}

async function importOneExampleWithProgress(runtime, progressEvents) {
  const result = await runtime.importWords("token", "", ["merit"], [example], {
    addWords: false,
    addExamples: true,
    addStudy: false,
    onProgress(progress) {
      progressEvents.push(progress);
    },
  });
  return result.examples;
}

test("例句原型上传成功时，找不到变形词 ID 不算失败", async () => {
  const runtime = createMomoRuntime({ vocabularyIds: { merit: "1" } });
  const result = await importOneExample(runtime);

  assert.equal(result.success.length, 1);
  assert.equal(result.duplicate.length, 0);
  assert.equal(result.failed.length, 0);
});

test("例句已存在于原型时，找不到变形词 ID 仍计为已存在", async () => {
  const runtime = createMomoRuntime({
    vocabularyIds: { merit: "1" },
    initialPhrases: { 1: [example] },
  });
  const result = await importOneExample(runtime);

  assert.equal(result.success.length, 0);
  assert.equal(result.duplicate.length, 1);
  assert.equal(result.failed.length, 0);
});

test("原型和变形词都找不到 ID 时，例句仍计为失败", async () => {
  const runtime = createMomoRuntime({ vocabularyIds: {} });
  const result = await importOneExample(runtime);

  assert.equal(result.success.length, 0);
  assert.equal(result.duplicate.length, 0);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason, /未找到对应的单词 ID/);
});

test("唯一可用词条提交失败时，例句仍计为失败", async () => {
  const runtime = createMomoRuntime({
    vocabularyIds: { merit: "1" },
    failedPhraseIds: ["1"],
  });
  const result = await importOneExample(runtime);

  assert.equal(result.success.length, 0);
  assert.equal(result.duplicate.length, 0);
  assert.equal(result.failed.length, 1);
});

test("一个词形上传成功、另一个词形提交失败时，整条例句计为成功", async () => {
  const runtime = createMomoRuntime({
    vocabularyIds: { merit: "1", merits: "2" },
    failedPhraseIds: ["2"],
  });
  const result = await importOneExample(runtime);

  assert.equal(result.success.length, 1);
  assert.equal(result.duplicate.length, 0);
  assert.equal(result.failed.length, 0);
});

test("一个词形已有例句、另一个词形提交失败时，整条例句计为已存在", async () => {
  const runtime = createMomoRuntime({
    vocabularyIds: { merit: "1", merits: "2" },
    initialPhrases: { 1: [example] },
    failedPhraseIds: ["2"],
  });
  const result = await importOneExample(runtime);

  assert.equal(result.success.length, 0);
  assert.equal(result.duplicate.length, 1);
  assert.equal(result.failed.length, 0);
});

test("首批完成前会上报可校准的预计剩余秒数", async () => {
  const runtime = createMomoRuntime({ vocabularyIds: { merit: "1" } });
  const progressEvents = [];
  await importOneExampleWithProgress(runtime, progressEvents);

  const firstBatchComplete = progressEvents.findIndex((progress) => progress.phase === "batchComplete");
  const estimatesBeforeCompletion = progressEvents
    .slice(0, firstBatchComplete)
    .filter((progress) => Number(progress.estimatedRemainingSeconds) > 0);

  assert.ok(firstBatchComplete > 0);
  assert.ok(estimatesBeforeCompletion.length >= 4);
  for (let index = 1; index < estimatesBeforeCompletion.length; index += 1) {
    assert.ok(
      estimatesBeforeCompletion[index].estimatedRemainingSeconds <=
        estimatesBeforeCompletion[index - 1].estimatedRemainingSeconds,
    );
  }
});
