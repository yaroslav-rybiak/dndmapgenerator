// One-off: rewrite maps/*.json from the version-1 format into version 2.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize, serialize } from "../src/model.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "maps");
for (const file of (await fs.readdir(dir)).filter((f) => f.endsWith(".json"))) {
  const name = file.slice(0, -5);
  const data = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
  const map = normalize(data, name);
  await fs.writeFile(path.join(dir, file), serialize({ ...map, name }) + "\n");
  console.log(`${file}: v${data.version ?? 1} -> v${map.version} (${map.rows}x${map.cols})`);
}
