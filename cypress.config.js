import { defineConfig } from "cypress";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 8421;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.dirname(new URL(import.meta.url).pathname);

async function waitForServer(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Map server did not start at ${url}`);
}

export default defineConfig({
  e2e: {
    baseUrl: BASE,
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: false,
    video: false,
    viewportWidth: 1920,
    viewportHeight: 1080,
    screenshotOnRunFailure: true,
    async setupNodeEvents(on, config) {
      // Each run gets its own maps folder seeded from ./maps, so specs can save and
      // delete freely without touching the real library.
      const mapsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dndmaps-"));
      const seed = () => {
        for (const f of fs.readdirSync(mapsDir)) fs.rmSync(path.join(mapsDir, f));
        for (const f of fs.readdirSync(path.join(ROOT, "maps")).filter((f) => f.endsWith(".json"))) {
          fs.copyFileSync(path.join(ROOT, "maps", f), path.join(mapsDir, f));
        }
        return null;
      };
      seed();

      const server = spawn("node", [path.join(ROOT, "server.mjs")], {
        env: { ...process.env, PORT: String(PORT), MAPS_DIR: mapsDir },
        stdio: "ignore",
      });
      const stop = () => {
        server.kill();
        fs.rmSync(mapsDir, { recursive: true, force: true });
      };
      process.on("exit", stop);
      on("after:run", stop);
      await waitForServer(`${BASE}/api/maps`);

      on("task", {
        resetMaps: seed,
        readMap: (name) => JSON.parse(fs.readFileSync(path.join(mapsDir, `${name}.json`), "utf8")),
        mapExists: (name) => fs.existsSync(path.join(mapsDir, `${name}.json`)),
      });

      // Headless Chrome defaults to a 1280x720 window, smaller than the TV resolutions
      // we test at. Grow the window so cy.viewport() is honoured and screenshots are pixel-true.
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.family === "chromium") {
          launchOptions.args.push("--window-size=3840,2160", "--force-device-scale-factor=1");
        }
        return launchOptions;
      });

      config.env.mapsDir = mapsDir;
      return config;
    },
  },
});
