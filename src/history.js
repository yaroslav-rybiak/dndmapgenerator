// Undo/redo over immutable `cells` arrays. Snapshots are references, so this is cheap.
export function createHistory(limit = 100) {
  let past = [];
  let future = [];
  return {
    /** Record the state *before* an edit. Clears the redo stack. */
    push(cells) {
      past.push(cells);
      if (past.length > limit) past.shift();
      future = [];
    },
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(current);
      return future.pop();
    },
    clear() {
      past = [];
      future = [];
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
