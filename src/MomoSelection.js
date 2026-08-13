var __MN_MOMO_SELECTION_GLOBAL__ = (function () {
  let lastDebug = {};

  function nativeMember(object, key) {
    if (!object) return undefined;
    let value = object[key];
    if (value === undefined && typeof object.objectForKey === "function") {
      value = object.objectForKey(key);
    }
    if (value === undefined && typeof object.valueForKey === "function") {
      value = object.valueForKey(key);
    }
    if (typeof value === "function") {
      try {
        value = value.call(object);
      } catch (ignored) {
        return undefined;
      }
    }
    return value;
  }

  function nativeArrayItems(list) {
    if (!list) return [];

    const rawCount = typeof list.count === "function"
      ? list.count()
      : list.count !== undefined ? list.count : list.length;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count < 1) return [];

    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push(typeof list.objectAtIndex === "function" ? list.objectAtIndex(index) : list[index]);
    }
    return items;
  }

  function titleFromObject(object) {
    if (!object) return undefined;
    return nativeMember(object, "noteTitle") || nativeMember(object, "title");
  }

  function titleFromSelectedView(selectedView) {
    const candidates = [
      nativeMember(selectedView, "note"),
      nativeMember(selectedView, "node"),
      nativeMember(selectedView, "mindMapNode"),
      nativeMember(selectedView, "mindmapNode"),
      nativeMember(selectedView, "view"),
    ];

    for (const candidate of candidates) {
      const directTitle = titleFromObject(candidate);
      if (directTitle !== undefined && directTitle !== null) return directTitle;
      const nestedNote = nativeMember(candidate, "note");
      const nestedTitle = titleFromObject(nestedNote);
      if (nestedTitle !== undefined && nestedTitle !== null) return nestedTitle;
    }
    return titleFromObject(selectedView);
  }

  function noteFromSelectedView(selectedView) {
    if (!selectedView) return undefined;

    const candidates = [
      nativeMember(selectedView, "note"),
      nativeMember(selectedView, "node"),
      nativeMember(selectedView, "mindMapNode"),
      nativeMember(selectedView, "mindmapNode"),
      nativeMember(selectedView, "view"),
      selectedView,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const directTitle = nativeMember(candidate, "noteTitle");
      if (directTitle !== undefined && directTitle !== null) return candidate;

      const nestedNote = nativeMember(candidate, "note");
      const nestedTitle = nativeMember(nestedNote, "noteTitle");
      if (nestedTitle !== undefined && nestedTitle !== null) return nestedNote;
    }

    return undefined;
  }

  function appendText(parts, value) {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (text) parts.push(text);
  }

  function noteText(note) {
    if (!note) return "";

    const parts = [];
    appendText(parts, nativeMember(note, "excerptText"));
    appendText(parts, nativeMember(note, "notesText"));

    for (const comment of nativeArrayItems(nativeMember(note, "comments"))) {
      if (String(nativeMember(comment, "type") || "") !== "TextNote") continue;
      appendText(parts, nativeMember(comment, "text"));
    }

    // allNoteText() 是较旧 MarginNote 版本中最完整的备用读取方式。
    if (parts.length === 0) appendText(parts, nativeMember(note, "allNoteText"));
    return parts.join("\n");
  }

  function selectedCards(window) {
    const application = Application.sharedInstance();
    const focusWindow = nativeMember(application, "focusWindow");
    const studyController = application.studyController(window || focusWindow);
    const notebookController = nativeMember(studyController, "notebookController");
    const mindmapView = nativeMember(notebookController, "mindmapView");
    const selectedList = nativeMember(mindmapView, "selViewLst");
    const selectedViews = nativeArrayItems(selectedList);
    const cards = [];
    const titleSamples = [];

    lastDebug = {
      windowProvided: !!window,
      focusWindowAvailable: !!focusWindow,
      studyControllerAvailable: !!studyController,
      notebookControllerAvailable: !!notebookController,
      mindmapViewAvailable: !!mindmapView,
      selectionListAvailable: !!selectedList,
      selectedViewCount: selectedViews.length,
      titleSamples,
    };

    for (const selectedView of selectedViews) {
      const rawTitle = titleFromSelectedView(selectedView);
      if (rawTitle === null || typeof rawTitle === "undefined") {
        if (titleSamples.length < 3) titleSamples.push("<未读取到标题>");
        continue;
      }

      const title = String(rawTitle).trim();
      if (titleSamples.length < 3) titleSamples.push(title || "<空标题>");
      if (!title) continue;

      cards.push({
        title,
        text: noteText(noteFromSelectedView(selectedView)),
      });
    }

    return cards;
  }

  function selectedTitles(window) {
    return selectedCards(window).map((card) => card.title);
  }

  function selectionDebug() {
    return lastDebug;
  }

  return {
    selectedCards,
    selectedTitles,
    selectionDebug,
  };
})();
