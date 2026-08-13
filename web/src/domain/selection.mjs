export function selectedTitlesFromNodes(nodes) {
  const titles = [];
  const selectedNodes = Array.isArray(nodes) ? nodes : [];

  for (const nodeView of selectedNodes) {
    const title = nodeView && nodeView.note && nodeView.note.noteTitle;
    if (typeof title === "string" && title.trim()) {
      titles.push(title);
    }
  }

  return titles;
}
