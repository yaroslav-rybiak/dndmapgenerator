// Persistence: the local Node server (maps/*.json), JSON export/import, and a
// localStorage draft so a closed tab never loses work.
import { normalize, serialize } from "./model.js";

const API = "/api/maps";

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error("Map server not reachable. Start it with: npm start");
  }
  if (res.status === 404) throw new Error("Map not found");
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error; } catch { /* ignore */ }
    throw new Error(detail || `Server error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const mapServer = {
  list: () => request(API),
  load: async (name) => normalize(await request(`${API}/${encodeURIComponent(name)}`), name),
  save: (name, map) =>
    request(`${API}/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: serialize({ ...map, name }),
    }),
  remove: (name) => request(`${API}/${encodeURIComponent(name)}`, { method: "DELETE" }),
};

export function downloadMap(map) {
  const blob = new Blob([serialize(map)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${map.name || "map"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readMapFile(file) {
  const fallback = file.name.replace(/\.(json|txt)$/i, "").replace(/[^A-Za-z0-9_-]/g, "") || "untitled";
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Not valid JSON");
  }
  return normalize(data, fallback);
}

const DRAFT_KEY = "dndmap.draft";

export const draft = {
  save(payload) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); } catch { /* quota or private mode */ }
  },
  load() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return { ...parsed, map: normalize(parsed.map, parsed.map?.name) };
    } catch {
      return null;
    }
  },
  clear() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  },
};
