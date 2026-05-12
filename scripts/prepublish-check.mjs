import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function newestMtime(dir, ignore = new Set([".next", "out", "node_modules"])) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name)) continue;
    const path = join(dir, entry.name);
    const stat = statSync(path);
    if (stat.isDirectory()) newest = Math.max(newest, newestMtime(path, ignore));
    else newest = Math.max(newest, stat.mtimeMs);
  }
  return newest;
}

run("pnpm", ["run", "lint:workspace"]);
run("pnpm", ["run", "typecheck"]);
run("pnpm", ["run", "test:unit"]);
run("pnpm", ["run", "build:dashboard"]);

const indexPath = join(process.cwd(), "dashboard", "out", "index.html");
if (!existsSync(indexPath)) {
  throw new Error("dashboard/out/index.html is missing after dashboard build");
}

const sourceMtime = newestMtime(join(process.cwd(), "dashboard"));
const outputMtime = statSync(indexPath).mtimeMs;
if (outputMtime < sourceMtime) {
  throw new Error("dashboard/out/index.html is older than dashboard source files");
}
