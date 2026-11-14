const REQUEST_INTERVAL_SECONDS = 1.7;
const ESTIMATED_REQUESTS_PER_EXAMPLE = 6;
const EXAMPLES_PER_BATCH = 10;

export function estimateInitialRemainingSeconds(exampleCount, extraRequestCount = 0) {
  const examples = Math.max(0, Number(exampleCount) || 0);
  const extraRequests = Math.max(0, Number(extraRequestCount) || 0);
  if (examples <= 0) return 0;
  const batches = Math.ceil(examples / EXAMPLES_PER_BATCH);
  const requestCount = batches + examples * ESTIMATED_REQUESTS_PER_EXAMPLE + extraRequests;
  return Math.max(1, Math.ceil(requestCount * REQUEST_INTERVAL_SECONDS));
}

export function updateEstimateDeadline(currentDeadline, progress, now = Date.now()) {
  const current = Math.max(0, Number(currentDeadline) || 0);
  if (progress?.phase === "waiting") {
    const waitSeconds = Math.max(0, Number(progress.waitSeconds) || 0);
    return waitSeconds > 0 ? Math.max(current, now) + waitSeconds * 1000 : current;
  }

  const estimatedSeconds = Number(progress?.estimatedRemainingSeconds);
  if (!Number.isFinite(estimatedSeconds) || estimatedSeconds <= 0) return current;
  const calibrated = now + estimatedSeconds * 1000;
  return current > 0 ? Math.min(current, calibrated) : calibrated;
}

export function remainingSecondsAt(deadline, now = Date.now()) {
  const remainingMilliseconds = Math.max(0, (Number(deadline) || 0) - now);
  return Math.ceil(remainingMilliseconds / 1000);
}
