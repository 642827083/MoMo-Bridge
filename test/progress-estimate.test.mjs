import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateInitialRemainingSeconds,
  remainingSecondsAt,
  updateEstimateDeadline,
} from "../web/src/domain/progressEstimate.mjs";

test("任务开始时立即生成可显示的预计剩余时间", () => {
  assert.ok(estimateInitialRemainingSeconds(1) > 0);
  assert.ok(estimateInitialRemainingSeconds(25) > estimateInitialRemainingSeconds(10));
});

test("正常校准只能缩短或保持预计完成时间", () => {
  const now = 1_000_000;
  const currentDeadline = now + 60_000;

  assert.equal(
    updateEstimateDeadline(currentDeadline, { phase: "uploading", estimatedRemainingSeconds: 30 }, now),
    now + 30_000,
  );
  assert.equal(
    updateEstimateDeadline(currentDeadline, { phase: "uploading", estimatedRemainingSeconds: 90 }, now),
    currentDeadline,
  );
});

test("限流或网络重试会把明确等待时间加入预计完成时间", () => {
  const now = 1_000_000;
  const currentDeadline = now + 30_000;

  assert.equal(
    updateEstimateDeadline(currentDeadline, { phase: "waiting", waitSeconds: 60 }, now),
    currentDeadline + 60_000,
  );
});

test("倒计时到零后显示为即将完成而不是重新计算", () => {
  assert.equal(remainingSecondsAt(1_030_000, 1_000_000), 30);
  assert.equal(remainingSecondsAt(1_030_000, 1_031_000), 0);
});
