// Launches the Cypress CLI with a clean environment.
//
// VS Code terminals (and tools embedded in VS Code) export ELECTRON_RUN_AS_NODE=1.
// Cypress's Electron binary inherits it, starts as plain Node and never opens a
// browser. Strip the variable, then forward every argument to the real CLI.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("cypress/package.json");
const cli = join(dirname(pkgPath), require(pkgPath).bin.cypress);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
