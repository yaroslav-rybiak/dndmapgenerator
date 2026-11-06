// Application wiring: state, input handling, persistence flows. Rendering lives in
// renderer.js, the document model in model.js, the menu in menu.js.
import { fitLayout, pixelToHex } from "./hex.js";
import {
  createMap, normalize, indexOf, setTerrain, setObject, setToken, clearCell, rename,
  applyBrush, brushPaintsOnDrag, brushLabel, DEFAULT_BRUSH, NAME_RE,
} from "./model.js";
import { createHistory } from "./history.js";
import { createRenderer } from "./renderer.js";
import { createMenu } from "./menu.js";
import { createToast, showForm, confirmDialog } from "./ui.js";
import { mapServer, downloadMap, readMapFile, draft } from "./storage.js";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const badge = $("badge");
const toast = createToast($("toast"));
const renderer = createRenderer(canvas);
const history = createHistory();

const state = {
  map: null,
  savedName: null, // name on the server, null when never saved (or deleted)
  dirty: false,
  brush: DEFAULT_BRUSH,
  play: false,
  hover: null,
  contextCell: null,
  layout: null,
  stroke: null, // { base: cells, visited: Set } while the left button is held
};

// ---------- rendering & layout ----------

function render() {
  renderer.render({ map: state.map, layout: state.layout, hover: state.play ? null : state.hover });
}

function relayout() {
  const r = renderer.resize();
  if (state.map) state.layout = fitLayout(r.width, r.height, state.map.cols, state.map.rows);
  render();
}

function cellFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return pixelToHex(state.layout, e.clientX - r.left, e.clientY - r.top, state.map.cols, state.map.rows);
}

// ---------- document state ----------

let draftTimer;
function flushDraft() {
  clearTimeout(draftTimer);
  if (state.map) draft.save({ map: state.map, savedName: state.savedName, dirty: state.dirty });
}
function persistDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraft, 300);
}

function syncURL() {
  const url = new URL(window.location.href);
  if (state.savedName) url.searchParams.set("map", state.savedName);
  else url.searchParams.delete("map");
  window.history.replaceState({}, "", url);
}

function updateBadge() {
  $("badgeName").textContent = state.map.name;
  badge.classList.toggle("dirty", state.dirty);
  badge.title = state.dirty ? "Unsaved changes (⌘S to save)" : state.savedName ? "Saved" : "Not saved yet";
  document.title = `${state.dirty ? "• " : ""}${state.map.name} – D&D Map Editor`;
}

function setDirty(on) {
  state.dirty = on;
  updateBadge();
  persistDraft();
}

function setMap(map, { savedName, dirty }) {
  state.map = map;
  state.savedName = savedName;
  state.dirty = dirty;
  state.hover = null;
  history.clear();
  relayout();
  updateBadge();
  syncURL();
  persistDraft();
}

/** Apply a single undoable edit. */
function edit(fn) {
  const next = fn(state.map);
  if (next === state.map) return;
  history.push(state.map.cells);
  state.map = next;
  setDirty(true);
  render();
}

function undo() {
  const prev = history.undo(state.map.cells);
  if (!prev) return;
  state.map = { ...state.map, cells: prev };
  setDirty(true);
  render();
}

function redo() {
  const next = history.redo(state.map.cells);
  if (!next) return;
  state.map = { ...state.map, cells: next };
  setDirty(true);
  render();
}

function setBrush(brush) {
  state.brush = brush;
  const action =
    brush.kind === "eraser" ? "clear" : brush.kind === "terrain" ? `terrain:${brush.type}` : `${brush.type}:${brush.state}`;
  menu.setBrush(brushLabel(brush), action);
}

function setPlay(on) {
  state.play = on;
  document.body.classList.toggle("play", on);
  menu.setChecked("play", on);
  render();
  toast(on ? "Play mode: left click disabled, right click still works" : "Edit mode");
}

// ---------- map library flows ----------

async function guardUnsaved(what) {
  if (!state.dirty) return true;
  return confirmDialog($("confirmDialog"), {
    title: "Discard unsaved changes?",
    message: `“${state.map.name}” has unsaved changes. ${what} will discard them.`,
    okLabel: "Discard",
    danger: true,
  });
}

async function openMap(name) {
  try {
    const map = await mapServer.load(name);
    setMap(map, { savedName: name, dirty: false });
    toast(`Opened ${name}`);
    return true;
  } catch (err) {
    toast(`${err.message}: ${name}`, "error");
    return false;
  }
}

async function newMap() {
  if (!(await guardUnsaved("Creating a new map"))) return;
  const values = await showForm($("newMapDialog"), { name: "untitled", cols: 24, rows: 14, terrain: "floor" });
  if (!values) return;
  setMap(createMap(values), { savedName: null, dirty: false });
  toast(`New ${values.cols}×${values.rows} map`);
}

async function saveAs() {
  const values = await showForm($("saveAsDialog"), { name: state.map.name === "untitled" ? "" : state.map.name });
  if (!values) return false;
  const name = values.name.trim();
  if (!NAME_RE.test(name)) {
    toast("Name: letters, digits, - and _ only", "error");
    return false;
  }
  if (name !== state.savedName) {
    let existing = [];
    try { existing = await mapServer.list(); } catch { /* server error surfaces on save */ }
    if (existing.some((m) => m.name === name)) {
      const ok = await confirmDialog($("confirmDialog"), {
        title: "Overwrite map?",
        message: `A map named “${name}” already exists.`,
        okLabel: "Overwrite",
        danger: true,
      });
      if (!ok) return false;
    }
  }
  return persist(name);
}

async function save() {
  if (!state.savedName) return saveAs();
  return persist(state.savedName);
}

async function persist(name) {
  try {
    await mapServer.save(name, state.map);
    state.map = rename(state.map, name);
    state.savedName = name;
    setDirty(false);
    syncURL();
    toast(`Saved ${name}`);
    return true;
  } catch (err) {
    toast(err.message, "error");
    return false;
  }
}

async function deleteMap() {
  if (!state.savedName) {
    toast("This map is not saved on the server", "error");
    return;
  }
  const name = state.savedName;
  const ok = await confirmDialog($("confirmDialog"), {
    title: "Delete map?",
    message: `“${name}” will be removed from the server. The map stays open here until you close it.`,
    okLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await mapServer.remove(name);
    state.savedName = null;
    setDirty(true);
    syncURL();
    toast(`Deleted ${name}`);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function importFile(file) {
  if (!(await guardUnsaved("Importing a file"))) return;
  try {
    const map = await readMapFile(file);
    setMap(map, { savedName: null, dirty: true });
    toast(`Imported ${file.name}. Save it to keep it on the server.`);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function refreshMapList() {
  try {
    menu.setMaps(await mapServer.list(), { current: state.savedName });
  } catch (err) {
    menu.setMaps([], { error: err.message });
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ---------- menu ----------

function cellIndex() {
  return state.contextCell ? indexOf(state.map, state.contextCell.q, state.contextCell.r) : -1;
}

function onMenuAction(action) {
  const [kind, arg] = action.split(":");
  const i = cellIndex();
  switch (kind) {
    case "terrain":
      setBrush({ kind: "terrain", type: arg });
      if (i >= 0) edit((m) => setTerrain(m, i, arg));
      return;
    case "door":
    case "monster": {
      const setter = kind === "door" ? setObject : setToken;
      if (arg === "remove") {
        if (i >= 0) edit((m) => setter(m, i, null));
        return;
      }
      setBrush({ kind: kind === "door" ? "object" : "token", type: kind, state: arg });
      if (i >= 0) edit((m) => setter(m, i, { type: kind, state: arg }));
      return;
    }
    case "clear":
      setBrush({ kind: "eraser" });
      if (i >= 0) edit((m) => clearCell(m, i));
      return;
    case "open":
      guardUnsaved("Opening another map").then((ok) => ok && openMap(arg));
      return;
    case "new": newMap(); return;
    case "save": save(); return;
    case "save-as": saveAs(); return;
    case "delete": deleteMap(); return;
    case "export": downloadMap(state.map); return;
    case "import": $("fileInput").value = ""; $("fileInput").click(); return;
    case "undo": undo(); return;
    case "redo": redo(); return;
    case "play": setPlay(!state.play); return;
    case "fullscreen": toggleFullscreen(); return;
    default: return;
  }
}

const menu = createMenu($("menu"), onMenuAction);

// ---------- input ----------

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (!state.map) return;
  state.contextCell = cellFromEvent(e);
  endStroke();
  menu.setEnabled("undo", history.canUndo);
  menu.setEnabled("redo", history.canRedo);
  menu.openAt(e.clientX, e.clientY, { hasCell: !!state.contextCell });
  refreshMapList();
});

function paintCell(cell) {
  const i = indexOf(state.map, cell.q, cell.r);
  if (state.stroke.visited.has(i)) return;
  state.stroke.visited.add(i);
  const next = applyBrush(state.map, i, state.brush);
  if (next !== state.map) {
    state.map = next;
    render();
  }
}

function endStroke() {
  const s = state.stroke;
  state.stroke = null;
  if (s && s.base !== state.map.cells) {
    history.push(s.base);
    setDirty(true);
  }
}

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !state.map) return;
  if (menu.isOpen) { menu.close(); return; } // dismissing the menu must not edit anything
  if (state.play) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  state.stroke = { base: state.map.cells, visited: new Set() };
  paintCell(cell);
});

canvas.addEventListener("mousemove", (e) => {
  if (!state.map) return;
  const cell = cellFromEvent(e);
  if (state.stroke && cell && brushPaintsOnDrag(state.brush)) paintCell(cell);
  const changed = (cell?.q !== state.hover?.q) || (cell?.r !== state.hover?.r);
  if (changed) {
    state.hover = cell;
    if (!state.play) render();
  }
});

window.addEventListener("mouseup", endStroke);
canvas.addEventListener("mouseleave", () => {
  if (state.hover) { state.hover = null; render(); }
});

$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) importFile(file);
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { menu.close(); return; }
  if (document.querySelector("dialog[open]") || e.target.matches("input, select, textarea")) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if (mod && key === "y") { e.preventDefault(); redo(); }
  else if (mod && key === "s") { e.preventDefault(); save(); }
});

window.addEventListener("resize", relayout);
window.addEventListener("beforeunload", (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("pagehide", flushDraft);

// ---------- boot ----------

async function boot() {
  await renderer.ready;
  const urlName = new URLSearchParams(window.location.search).get("map");
  const saved = draft.load();

  if (urlName && saved?.dirty && saved.savedName === urlName) {
    setMap(saved.map, { savedName: saved.savedName, dirty: true });
    toast(`Restored unsaved changes to ${urlName}`);
  } else if (urlName) {
    const ok = await openMap(urlName);
    if (!ok) setMap(createMap(), { savedName: null, dirty: false });
  } else if (saved) {
    setMap(saved.map, { savedName: saved.savedName, dirty: saved.dirty });
    if (saved.dirty) toast(`Restored unsaved draft of ${saved.map.name}`);
  } else {
    setMap(createMap(), { savedName: null, dirty: false });
    toast("Right-click anywhere for the menu");
  }
  setBrush(DEFAULT_BRUSH);
}

boot();

// Test hook: read-only view of the app state for Cypress.
window.__dnd = {
  getMap: () => state.map,
  getCell: (q, r) => state.map.cells[indexOf(state.map, q, r)],
  getBrush: () => state.brush,
  getLayout: () => state.layout,
  isDirty: () => state.dirty,
  isPlay: () => state.play,
  savedName: () => state.savedName,
  normalize,
};
