export function importResultHasFailures(result, options = {}) {
  if (!result) return false;
  const words = result.words || result;
  const examples = result.examples || {};
  const study = result.study || {};
  return Boolean(
    (options.addWords && words.failed?.length)
    || (options.addExamples && (examples.failed?.length || examples.error))
    || (options.addStudy && (
      study.notAddedCount > 0 || study.missing?.length || study.error
      || (options.advanceStudy && (study.notAdvancedCount > 0 || study.advanceError))
    )),
  );
}

function submittedCount(values, outcomes) {
  if (Array.isArray(values)) return values.length;
  return [outcomes?.success, outcomes?.duplicate, outcomes?.failed]
    .reduce((total, items) => total + (Array.isArray(items) ? items.length : 0), 0);
}

export function importHistorySummary(entry) {
  const input = entry.input || {};
  const options = entry.options || {};
  const result = entry.result || {};
  const parts = [];
  if (options.addWords) {
    parts.push(`${submittedCount(input.wordbookWords ?? input.words, result.words)} 个单词`);
  }
  if (options.addExamples) {
    parts.push(`${submittedCount(input.examples, result.examples)} 条例句`);
  }
  if (options.addStudy) {
    const words = input.studyWords ?? input.words;
    const count = Array.isArray(words) ? words.length : Number(result.study?.requestedCount) || 0;
    parts.push(`背诵 ${count} 个`);
  }
  return parts.join(" · ");
}
