function wordsFromNotepad(notepad) {
  const words = new Set();
  const items = Array.isArray(notepad && notepad.list) ? notepad.list : [];

  for (const item of items) {
    if (item && item.type === "WORD" && typeof item.data?.word === "string") {
      words.add(item.data.word.trim().toLowerCase());
    }
  }

  return words;
}

function normalizeWords(words) {
  const seen = new Set();
  const result = [];

  for (const word of Array.isArray(words) ? words : []) {
    if (typeof word !== "string") continue;
    const normalized = word.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function buildNotepadUpdate(notepad, words) {
  if (!notepad || typeof notepad.id !== "string" || !notepad.id) {
    throw new Error("未找到有效的目标云词本");
  }

  const existing = wordsFromNotepad(notepad);
  const candidates = [];
  const duplicates = [];

  for (const word of normalizeWords(words)) {
    if (existing.has(word)) {
      duplicates.push(word);
    } else {
      candidates.push(word);
    }
  }

  const content = String(notepad.content || "").trim();
  const nextContent = candidates.length === 0
    ? content
    : [content, candidates.join("\n")].filter(Boolean).join("\n");

  return {
    request: {
      id: notepad.id,
      notepad: {
        status: notepad.status,
        content: nextContent,
        title: notepad.title,
        brief: notepad.brief,
        tags: Array.isArray(notepad.tags) ? notepad.tags : [],
      },
    },
    candidates,
    duplicates,
  };
}

export function classifyImportResult(before, after, words) {
  const previous = wordsFromNotepad(before);
  const current = wordsFromNotepad(after);
  const result = {
    success: [],
    duplicate: [],
    failed: [],
  };

  for (const word of normalizeWords(words)) {
    if (previous.has(word)) {
      result.duplicate.push(word);
    } else if (current.has(word)) {
      result.success.push(word);
    } else {
      result.failed.push(word);
    }
  }

  return result;
}
