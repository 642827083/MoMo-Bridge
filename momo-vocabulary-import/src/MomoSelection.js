var __MN_MOMO_SELECTION_GLOBAL__ = (function () {
  function nativeArrayItems(list) {
    if (!list) return [];

    const count = Number(list.count !== undefined ? list.count : list.length);
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
      const title = selectedView && selectedView.note ? selectedView.note.noteTitle : null;
      if (typeof title === "string" && title.trim()) {
        titles.push(title);
      }
    }

    return titles;
  }

  return {
    selectedTitles,
  };
})();
