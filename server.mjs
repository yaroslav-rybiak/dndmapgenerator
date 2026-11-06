#!/usr/bin/env node
// Zero-dependency local server: serves the editor and stores maps as maps/<name>.json.
//
//   GET    /api/maps          -> [{ name, rows, cols, updatedAt }]
//   GET    /api/maps/:name    -> map JSON
//   PUT    /api/maps/:name    -> save (body: map JSON)
//   DELETE /api/maps/:name
//
// Env: PORT (default 8420), MAPS_DIR (default ./maps), HOST (default 127.0.0.1).
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = path.resolve(process.env.MAPS_DIR || path.join(ROOT, "maps"));
const PORT = Number(process.env.PORT) || 8420;
const HOST = process.env.HOST || "127.0.0.1";
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_BODY = 5 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
};
const json = (res, status, data) =>
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8" });
const mapPath = (name) => path.join(MAPS_DIR, `${name}.json`);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function listMaps() {
  await fs.mkdir(MAPS_DIR, { recursive: true });
  const files = (await fs.readdir(MAPS_DIR)).filter((f) => f.endsWith(".json"));
  const out = [];
  for (const file of files) {
    const name = file.slice(0, -5);
    if (!NAME_RE.test(name)) continue;
    try {
      const [text, stat] = await Promise.all([fs.readFile(mapPath(name), "utf8"), fs.stat(mapPath(name))]);
      const data = JSON.parse(text);
      out.push({ name, rows: data.rows, cols: data.cols, updatedAt: stat.mtime.toISOString() });
    } catch {
      /* skip unreadable files */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function handleApi(req, res, segments) {
  const [name] = segments;
  if (!name) {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
    return json(res, 200, await listMaps());
  }
  if (!NAME_RE.test(name)) return json(res, 400, { error: "Invalid map name" });
  const file = mapPath(name);

  if (req.method === "GET") {
    try {
      return send(res, 200, await fs.readFile(file), { "Content-Type": MIME[".json"] });
    } catch {
      return json(res, 404, { error: "Map not found" });
    }
  }
  if (req.method === "PUT") {
    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch (err) {
      return json(res, 400, { error: err.message === "Body too large" ? err.message : "Invalid JSON" });
    }
    if (!data || !Number.isInteger(data.rows) || !Number.isInteger(data.cols) || !Array.isArray(data.cells)) {
      return json(res, 400, { error: "Invalid map: expected rows, cols and cells" });
    }
    await fs.mkdir(MAPS_DIR, { recursive: true });
    const payload = { ...data, name };
    await fs.writeFile(file, JSON.stringify(payload, null, 1) + "\n");
    const stat = await fs.stat(file);
    return json(res, 200, { name, rows: data.rows, cols: data.cols, updatedAt: stat.mtime.toISOString() });
  }
  if (req.method === "DELETE") {
    try {
      await fs.unlink(file);
      return send(res, 204, "");
    } catch {
      return json(res, 404, { error: "Map not found" });
    }
  }
  return json(res, 405, { error: "Method not allowed" });
}

async function handleStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  const rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || rel.startsWith("/.") || rel.startsWith("/node_modules/")) {
    return send(res, 404, "Not found");
  }
  try {
    const data = await fs.readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    return send(res, 200, req.method === "HEAD" ? "" : data, { "Content-Type": type });
  } catch {
    return send(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (pathname === "/api/maps" || pathname.startsWith("/api/maps/")) {
      const segments = pathname.split("/").slice(3).filter(Boolean);
      return await handleApi(req, res, segments);
    }
    return await handleStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Internal error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`D&D map editor: http://${HOST}:${PORT}/  (maps in ${MAPS_DIR})`);
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
