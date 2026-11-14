import { extractLemma } from "./lemma.mjs";

const ENGLISH_FORM = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;

function textValue(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .trim();
}

function normalizedTitle(value) {
  return textValue(value).replace(/\s+/g, " ").trim();
}

function removeTitlePrefix(lines, title) {
  const wanted = normalizedTitle(title);
  if (!wanted || lines.length === 0) return lines;

  const remaining = lines.slice();
  let joined = "";
  let consumed = 0;
  while (consumed < remaining.length && consumed < 4) {
    joined = `${joined}${joined ? " " : ""}${remaining[consumed]}`.replace(/\s+/g, " ").trim();
    consumed += 1;
    if (joined === wanted) return remaining.slice(consumed);
    if (!wanted.startsWith(joined)) return remaining;
  }
  return remaining;
}

function linesFromText(value, title) {
  const normalized = textValue(value);
  if (!normalized) return [];
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return removeTitlePrefix(lines, title);
}

function titleWordForms(title) {
  return normalizedTitle(title)
    .split(/[;；]/)
    .flatMap((segment) => segment.match(ENGLISH_FORM) || [])
    .map((word) => word.toLowerCase())
    .filter((word, index, words) => words.indexOf(word) === index);
}

const COMMON_GLUE_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "been", "before", "being", "but",
  "by", "for", "from", "had", "has", "have", "he", "in", "into", "is",
  "it", "its", "of", "on", "or", "onto", "she", "so", "that", "the",
  "their", "there", "these", "they", "this", "those", "to", "under", "was",
  "we", "were", "what", "when", "where", "which", "while", "who", "with",
  "you",
]);

// AutoComplete 丢失空格时，标题词形后面可能是功能词，也可能是普通英文词。
// 普通英文词只在确认是标题中的明确词形且不属于常见派生后缀时拆分。
const ATTACHED_DERIVATION_SUFFIXES = new Set([
  "s", "es", "ed", "ing", "er", "est", "ly", "ness", "less", "ful",
  "ish", "ity", "ment", "able", "ible", "al", "ial", "ous", "ious",
  "ive", "en", "ize", "ise", "ism", "ist", "ship", "hood", "dom",
  "ward", "wards", "wise", "y", "ning",
]);

const ATTACHED_COMPOUND_SUFFIXES = new Set([
  "based", "born", "driven", "free", "friendly", "headed", "house",
  "houses", "level", "like", "line", "lines", "looking", "made",
  "proof", "room", "rooms", "run", "standing", "term", "time", "times",
  "way", "ways", "weight", "weights", "wide", "work", "works", "year",
  "years",
]);

function isLikelySeparateFollowingWord(word) {
  const normalized = typeof word === "string" ? word.toLowerCase() : "";
  if (!/^[a-z][a-z'-]{1,}$/.test(normalized)) return false;
  if (!/[aeiouy]/.test(normalized)) return false;
  return !ATTACHED_DERIVATION_SUFFIXES.has(normalized) &&
    !ATTACHED_COMPOUND_SUFFIXES.has(normalized);
}

function isAllowedGluedPart(word, candidate, explicitForms, allowOrdinaryWord) {
  const normalized = typeof word === "string" ? word.toLowerCase() : "";
  if (COMMON_GLUE_WORDS.has(normalized)) return true;
  return allowOrdinaryWord && explicitForms.has(candidate) && isLikelySeparateFollowingWord(normalized);
}

function titleFormCandidates(forms) {
  const candidates = new Set();
  for (const form of Array.isArray(forms) ? forms : []) {
    if (!form) continue;
    candidates.add(form);
    candidates.add(`${form}s`);
    candidates.add(`${form}es`);
    candidates.add(`${form}ed`);
    candidates.add(`${form}ing`);
    candidates.add(`${form}er`);
    candidates.add(`${form}est`);
    if (form.endsWith("y")) {
      candidates.add(`${form.slice(0, -1)}ies`);
      candidates.add(`${form.slice(0, -1)}ied`);
    }
    if (form.endsWith("e")) candidates.add(`${form.slice(0, -1)}ing`);
  }
  return Array.from(candidates).sort((left, right) => right.length - left.length);
}

function splitGluedTitleForm(token, candidates, explicitForms) {
  const explicit = new Set(Array.isArray(explicitForms) ? explicitForms : []);
  for (const candidate of candidates) {
    const lowerToken = token.toLowerCase();
    const candidateIndex = lowerToken.indexOf(candidate);
    if (candidateIndex < 0) continue;

    const before = token.slice(0, candidateIndex);
    const after = token.slice(candidateIndex + candidate.length);
    const previous = before.slice(-1);

    // 标题词形必须位于片段开头或标点之后，避免把 lightness 误拆为 light ness。
    if (previous && /[A-Za-z]/.test(previous)) continue;

    if (after) {
      const afterMatch = after.match(/^([A-Za-z][A-Za-z'-]*)([^A-Za-z]*)$/);
      if (afterMatch && isAllowedGluedPart(afterMatch[1], candidate, explicit, true)) {
        return `${before}${token.slice(candidateIndex, candidateIndex + candidate.length)} ${afterMatch[1]}${afterMatch[2]}`;
      }
    }

    // 处理反向粘连，例如标题词形为 word 时的 theword。
    if (before) {
      const beforeMatch = before.match(/^(.*?)([A-Za-z][A-Za-z'-]*)$/);
      if (beforeMatch && isAllowedGluedPart(beforeMatch[2], candidate, explicit, false)) {
        return `${beforeMatch[1]}${beforeMatch[2]} ${token.slice(candidateIndex)}`;
      }
    }
  }

  return token;
}

function repairGluedTitleForm(line, forms) {
  const candidates = titleFormCandidates(forms);
  if (candidates.length === 0) return line;

  // 修复 AutoComplete 偶尔遗漏的词形与相邻词之间的空格，使例句包含独立词形。
  return line
    .split(/(\s+)/)
    .map((part) => /\s+/.test(part) ? part : splitGluedTitleForm(part, candidates, forms))
    .join("");
}

function matchedTitleForm(line, forms) {
  const words = new Set();
  for (const word of line.match(ENGLISH_FORM) || []) {
    const normalized = word.toLowerCase();
    words.add(normalized);
    // 标题词形可以出现在连字符复合词中，例如 Self-doubt；上传时保留原连字符。
    if (normalized.includes("-")) {
      normalized.split("-").filter(Boolean).forEach((part) => words.add(part));
    }
  }
  for (const candidate of titleFormCandidates(forms)) {
    if (words.has(candidate)) return candidate;
  }
  return "";
}

function containsTitleForm(line, forms) {
  return !!matchedTitleForm(line, forms);
}

function isEnglishSentence(line) {
  if (!/[A-Za-z]{2,}/.test(line) || /[\u3400-\u9fff]/.test(line)) return false;
  // 跳过音标、星级和词典元数据行。
  if (/^\s*[\[【(（].*[\]】)）]\s*$/.test(line)) return false;
  if (/^\s*(?:n|v|vt|vi|adj|adv|prep|conj|pron|art)\.?\s+/i.test(line)) return false;
  return line.split(/\s+/).filter(Boolean).length >= 3;
}

function isChineseText(line) {
  return /[\u3400-\u9fff]/.test(line);
}

function tagSourceFromLine(line) {
  const value = typeof line === "string" ? line.trim() : "";
  if (!value) return "";

  // MarginNote 将标签写成 hashtag 行，例如 "#2000EN #阅读 #Text2"。
  // 只有整行都是标签时才视为元数据，避免影响正文中的普通井号。
  const tags = value.match(/#[^\s#]+/g);
  if (!tags || tags.join("") !== value.replace(/\s+/g, "")) return "";
  return tags.join("").replace(/#/g, "");
}

export function extractExample(card) {
  const title = card && typeof card.title === "string" ? card.title : "";
  const lines = linesFromText(card && card.text, title);
  if (lines.length === 0) return null;

  const forms = titleWordForms(title);
  const tagLines = lines
    .map((line) => tagSourceFromLine(line))
    .filter(Boolean);
  const contentLines = lines.filter((line) => !tagSourceFromLine(line));
  // 卡片可能包含多条英文句子，优先选择包含卡片标题词形的句子，避免接口拒绝。
  const repairedLines = contentLines.map((line) => repairGluedTitleForm(line, forms));
  const sentence = repairedLines.find((line) => isEnglishSentence(line) && containsTitleForm(line, forms)) || "";
  const translationLines = contentLines.filter(isChineseText);
  const translation = translationLines.length > 0
    ? translationLines[translationLines.length - 1]
    : "";

  if (!sentence || !translation) return null;
  return {
    sentence,
    translation,
    matchedForm: matchedTitleForm(sentence, forms),
    origin: tagLines.length > 0 ? tagLines[tagLines.length - 1] : "",
  };
}

export function collectCardImports(cards) {
  const seen = new Set();
  const lemmas = [];
  const skippedTitles = [];
  const examples = [];
  const cardsWithoutExamples = [];

  for (const card of Array.isArray(cards) ? cards : []) {
    const title = card && typeof card.title === "string" ? card.title : "";
    const lemma = extractLemma(title);

    if (!lemma) {
      skippedTitles.push(title || "<未读取到标题>");
      continue;
    }

    const word = lemma;
    if (!seen.has(word)) {
      seen.add(word);
      lemmas.push(word);
    }

    const example = extractExample(card);
    if (!example) {
      cardsWithoutExamples.push(title);
      continue;
    }

    const exampleWord = example.matchedForm || word;
    const duplicate = examples.some((item) => (item.lemma || item.word) === word &&
      item.phrase === example.sentence && item.interpretation === example.translation);
    if (!duplicate) {
      examples.push({
        // 优先查询句子中实际出现的词形，词根用于不规则变化的备用查询。
        word: exampleWord,
        lemma: word,
        phrase: example.sentence,
        interpretation: example.translation,
        origin: example.origin,
        title,
      });
    }
  }

  return {
    lemmas,
    skippedTitles,
    examples,
    cardsWithoutExamples,
  };
}
