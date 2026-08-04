var __MN_MOMO_SELECTION_GLOBAL__ = (function () {
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
    const studyController = Application.sharedInstance().studyController(window);
    const mindmapView = studyController && studyController.notebookController
      ? studyController.notebookController.mindmapView
      : null;
    const titles = [];

    for (const selectedView of nativeArrayItems(mindmapView && mindmapView.selViewLst)) {
      const note = selectedView && selectedView.note;
      const rawTitle = note && note.noteTitle;
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
