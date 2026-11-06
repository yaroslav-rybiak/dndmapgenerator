// Map document model. Pure functions: every edit returns a new map object and never
// mutates the input, so undo history can hold previous `cells` arrays by reference.
//
// Format (version 2):
//   { version: 2, name, rows, cols, cells: [{ terrain, object?, token? }, ...] }
//   object = { type: "door", state }, token = { type: "monster", state }
// Version 1 files ({ rows, cols, tiles: [{ role, state }] }) are migrated on load.

import { TERRAIN, OBJECTS, TOKENS, DEFAULT_TERRAIN, firstState, nextState } from "./tiles.js";

export const VERSION = 2;
export const MAX_DIM = 80;
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function createMap({ name = "untitled", rows = 14, cols = 24, terrain = DEFAULT_TERRAIN } = {}) {
  rows = clampDim(rows);
  cols = clampDim(cols);
  const cells = Array.from({ length: rows * cols }, () => ({ terrain }));
  return { version: VERSION, name, rows, cols, cells };
}

export const indexOf = (map, q, r) => r * map.cols + q;
export const cellAt = (map, q, r) => map.cells[indexOf(map, q, r)];

function clampDim(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_DIM, n));
}

function cleanCell(raw) {
  const cell = { terrain: TERRAIN[raw?.terrain] ? raw.terrain : DEFAULT_TERRAIN };
  const obj = raw?.object;
  if (obj && OBJECTS[obj.type]) {
    cell.object = { type: obj.type, state: OBJECTS[obj.type].states[obj.state] ? obj.state : firstState(OBJECTS[obj.type]) };
  }
  const tok = raw?.token;
  if (tok && TOKENS[tok.type]) {
    cell.token = { type: tok.type, state: TOKENS[tok.type].states[tok.state] ? tok.state : firstState(TOKENS[tok.type]) };
  }
  return cell;
}

const V1_TERRAIN = { floor: "floor", wall_empty: "wall", wall_torch: "wall_torch" };

function migrateV1Tile(t) {
  if (!t || typeof t !== "object") return { terrain: DEFAULT_TERRAIN };
  if (t.role === "terrain") return { terrain: V1_TERRAIN[t.state] || DEFAULT_TERRAIN };
  if (t.role === "door") return { terrain: DEFAULT_TERRAIN, object: { type: "door", state: t.state } };
  if (t.role === "monster") return { terrain: DEFAULT_TERRAIN, token: { type: "monster", state: t.state } };
  return { terrain: DEFAULT_TERRAIN };
}

/** Accept any supported file shape and return a valid version-2 map. Throws on garbage. */
export function normalize(data, fallbackName = "untitled") {
  if (!data || typeof data !== "object") throw new Error("Not a map file");
  const rows = clampDim(data.rows);
  const cols = clampDim(data.cols);
  let source;
  if (Array.isArray(data.cells)) source = data.cells;
  else if (Array.isArray(data.tiles)) source = data.tiles.map(migrateV1Tile);
  else throw new Error("Not a map file: no cells");
  const cells = Array.from({ length: rows * cols }, (_, i) => cleanCell(source[i]));
  const name = typeof data.name === "string" && NAME_RE.test(data.name) ? data.name : fallbackName;
  return { version: VERSION, name, rows, cols, cells };
}

export function serialize(map) {
  return JSON.stringify({ version: VERSION, name: map.name, rows: map.rows, cols: map.cols, cells: map.cells }, null, 1);
}

function withCell(map, i, cell) {
  const cells = map.cells.slice();
  cells[i] = cell;
  return { ...map, cells };
}

export function setTerrain(map, i, terrain) {
  if (!TERRAIN[terrain] || map.cells[i].terrain === terrain) return map;
  return withCell(map, i, { ...map.cells[i], terrain });
}

export function setObject(map, i, object) {
  const { object: _drop, ...rest } = map.cells[i];
  return withCell(map, i, object ? { ...rest, object } : rest);
}

export function setToken(map, i, token) {
  const { token: _drop, ...rest } = map.cells[i];
  return withCell(map, i, token ? { ...rest, token } : rest);
}

/** Remove the token if present, otherwise the object. Returns the same map when the cell is bare. */
export function clearCell(map, i) {
  const cell = map.cells[i];
  if (cell.token) return setToken(map, i, null);
  if (cell.object) return setObject(map, i, null);
  return map;
}

export function rename(map, name) {
  return { ...map, name };
}

// Brushes: { kind: "terrain", type } | { kind: "object"|"token", type, state } | { kind: "eraser" }
export const DEFAULT_BRUSH = { kind: "terrain", type: DEFAULT_TERRAIN };

export function brushLabel(brush) {
  if (brush.kind === "eraser") return "Eraser";
  if (brush.kind === "terrain") return TERRAIN[brush.type].label;
  const def = brush.kind === "object" ? OBJECTS[brush.type] : TOKENS[brush.type];
  return `${def.label}: ${def.states[brush.state].label}`;
}

/**
 * Left-click semantics. Terrain brushes paint. Object/token brushes place their type when
 * absent and cycle its state when already present, so repeated clicks on a monster walk it
 * through alive -> injured -> dead. The eraser removes the token, then the object.
 */
export function applyBrush(map, i, brush) {
  const cell = map.cells[i];
  switch (brush.kind) {
    case "terrain":
      return setTerrain(map, i, brush.type);
    case "object": {
      const def = OBJECTS[brush.type];
      const existing = cell.object?.type === brush.type ? cell.object : null;
      const state = existing ? nextState(def, existing.state) : brush.state;
      return setObject(map, i, { type: brush.type, state });
    }
    case "token": {
      const def = TOKENS[brush.type];
      const existing = cell.token?.type === brush.type ? cell.token : null;
      const state = existing ? nextState(def, existing.state) : brush.state;
      return setToken(map, i, { type: brush.type, state });
    }
    case "eraser":
      return clearCell(map, i);
    default:
      return map;
  }
}

/** Drag painting only makes sense for terrain and the eraser; tokens would be duplicated. */
export const brushPaintsOnDrag = (brush) => brush.kind === "terrain" || brush.kind === "eraser";
