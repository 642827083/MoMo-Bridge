const ENGLISH_WORD = /^[a-z]+(?:['-][a-z]+)*$/i;

export function extractLemma(title) {
  if (typeof title !== "string") {
    return null;
  }

  const firstSegment = title
    .split(/[;；]/)
    .map((segment) => segment.trim())
    .find(Boolean);

  if (!firstSegment || !ENGLISH_WORD.test(firstSegment)) {
    return null;
  }

  return firstSegment.toLowerCase();
}

export function collectLemmas(titles) {
  const seen = new Set();
  const lemmas = [];
  const skippedTitles = [];

  for (const title of titles) {
    const lemma = extractLemma(title);
    if (!lemma) {
      skippedTitles.push(title);
      continue;
    }
    if (!seen.has(lemma)) {
      seen.add(lemma);
      lemmas.push(lemma);
    }
  }

  return { lemmas, skippedTitles };
}
