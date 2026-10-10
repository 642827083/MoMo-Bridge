import assert from "node:assert/strict";
import test from "node:test";
import { importHistorySummary, importResultHasFailures } from "../web/src/domain/importPresentation.mjs";

test("历史摘要按提交数量统计，失败和已存在项目不会缩减数量", () => {
  const entry = {
    options: { addWords: true, addExamples: true, addStudy: true },
    input: { words: ["account", "achieve", "benefit"], examples: [{}, {}], studyWords: ["benefit"] },
    result: { words: { success: ["account"], duplicate: ["achieve"], failed: ["benefit"] } },
  };
  assert.equal(importHistorySummary(entry), "3 个单词 · 2 条例句 · 背诵 1 个");
});

test("重试摘要使用各操作实际提交的数量，兼容缺少输入的旧记录", () => {
  assert.equal(importHistorySummary({
    options: { addWords: true, addExamples: true },
    input: { words: ["account", "accounts"], wordbookWords: ["account"], examples: [{}] },
  }), "1 个单词 · 1 条例句");
  assert.equal(importHistorySummary({
    options: { addExamples: true },
    result: { words: { success: ["account"] }, examples: { success: [{}], duplicate: [{}], failed: [{}] } },
  }), "3 条例句");
  assert.equal(importHistorySummary({ options: { addStudy: true }, result: { study: { requestedCount: 4 } } }), "背诵 4 个");
});

test("完成状态只判断启用的操作，保留例句错误和背诵提前复习失败", () => {
  const result = { failed: ["account"], examples: { error: "接口不可用" }, study: { notAdvancedCount: 1 } };
  assert.equal(importResultHasFailures(result, { addWords: true }), true);
  assert.equal(importResultHasFailures(result, { addExamples: true }), true);
  assert.equal(importResultHasFailures(result, { addStudy: true }), false);
  assert.equal(importResultHasFailures(result, { addStudy: true, advanceStudy: true }), true);
  assert.equal(importResultHasFailures({ duplicate: ["account"], historyError: "历史保存失败" }, { addWords: true }), false);
  assert.equal(importResultHasFailures({ study: { missing: ["account"] } }, { addStudy: true }), true);
  assert.equal(importResultHasFailures({ words: { failed: ["account"] } }, { addWords: true }), true);
  assert.equal(importResultHasFailures(null, { addWords: true }), false);
});
