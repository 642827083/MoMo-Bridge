var __MN_MOMO_SELECTION_GLOBAL__ = (function () {
  let lastDebug = {};

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
    const focusWindow = nativeMember(application, "focusWindow");
    const studyController = application.studyController(window || focusWindow);
    const notebookController = nativeMember(studyController, "notebookController");
    const mindmapView = nativeMember(notebookController, "mindmapView");
    const selectedList = nativeMember(mindmapView, "selViewLst");
    const selectedViews = nativeArrayItems(selectedList);
    const titles = [];

    lastDebug = {
      windowProvided: !!window,
      focusWindowAvailable: !!focusWindow,
      studyControllerAvailable: !!studyController,
      notebookControllerAvailable: !!notebookController,
      mindmapViewAvailable: !!mindmapView,
      selectionListAvailable: !!selectedList,
      selectedViewCount: selectedViews.length,
    };

    for (const selectedView of selectedViews) {
      const note = nativeMember(selectedView, "note");
      const rawTitle = nativeMember(note, "noteTitle")
        || nativeMember(selectedView, "noteTitle")
        || nativeMember(selectedView, "title");
      if (rawTitle === null || typeof rawTitle === "undefined") continue;
      const title = String(rawTitle).trim();
      if (title) {
        titles.push(title);
      }
    }

    return titles;
  }

  function selectionDebug() {
    return lastDebug;
  }

  return {
    selectedTitles,
    selectionDebug,
  };
})();
