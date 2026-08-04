var __MN_MOMO_SELECTION_GLOBAL__ = (function () {
  function nativeMember(object, key) {
    if (!object) return undefined;
    let value = object[key];
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

  function selectedTitles(window) {
    const application = Application.sharedInstance();
    const studyController = application.studyController(window || application.focusWindow);
    const notebookController = nativeMember(studyController, "notebookController");
    const mindmapView = nativeMember(notebookController, "mindmapView");
    const titles = [];

    for (const selectedView of nativeArrayItems(nativeMember(mindmapView, "selViewLst"))) {
      const note = nativeMember(selectedView, "note");
      const rawTitle = nativeMember(note, "noteTitle");
      if (rawTitle === null || typeof rawTitle === "undefined") continue;
      const title = String(rawTitle).trim();
      if (title) {
        titles.push(title);
      }
    }

    return titles;
  }

  return {
    selectedTitles,
  };
})();
