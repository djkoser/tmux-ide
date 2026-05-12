#!/usr/bin/env node
/**
 * Compile the layered .icon source (Apple's Icon Composer format) into
 * the macOS .icns + 1024×1024 master PNG that electron-builder + the
 * runtime dock icon consume.
 *
 * Pipeline:
 *   1. `ictool` (bundled inside Xcode 16's Icon Composer.app) renders
 *      each macOS iconset size at full bleed with the proper layered
 *      glass effect.
 *   2. `pad-icon.swift` insets each rendered image to 80% of the
 *      canvas, leaving a transparent 10% margin on each side. Without
 *      this step the icon overflows the macOS dock cell — looks
 *      noticeably bigger than other apps.
 *   3. `iconutil` packs the iconset into a real .icns.
 *   4. The 1024 master PNG is also padded for Linux/Windows + dev-mode
 *      `app.dock.setIcon` fallback.
 *
 * Source path: defaults to `~/Desktop/tmux-ide.icon` to match the
 * project's convention; override via the first positional argument or
 * `ICON_SOURCE` env var.
 *
 * Usage:
 *   pnpm --filter @tmux-ide/app-electron icon:build
 *   pnpm --filter @tmux-ide/app-electron icon:build /path/to/source.icon
 *   ICON_SOURCE=/path/to/source.icon pnpm --filter @tmux-ide/app-electron icon:build
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ICTOOL = "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool";
const PAD_SCRIPT = path.join(HERE, "pad-icon.swift");
const RESOURCES_DIR = path.join(ROOT, "resources");

const SOURCE = process.argv[2] ?? process.env.ICON_SOURCE ?? path.join(os.homedir(), "Desktop", "tmux-ide.icon");
const ICONSET = path.join(os.tmpdir(), "tmux-ide-AppIcon.iconset");
const RAW = path.join(os.tmpdir(), "tmux-ide-AppIcon.raw");

// macOS standard: visible content occupies ~80% of the canvas, with a
// transparent margin so the dock cell renders at the same size as
// stock apps (Finder, Safari, Mail).
const CONTENT_PERCENT = 80;
const SIZES = [16, 32, 128, 256, 512];

function check(): void {
  if (process.platform !== "darwin") {
    fail("icon:build only runs on macOS — needs Xcode's ictool + iconutil + swift");
  }
  if (!existsSync(ICTOOL)) {
    fail(`ictool not found at ${ICTOOL} — install Xcode 16 (Icon Composer.app)`);
  }
  if (!existsSync(SOURCE)) {
    fail(`icon source not found at ${SOURCE} — pass a path or set ICON_SOURCE`);
  }
  try {
    execFileSync("iconutil", ["--help"], { stdio: "ignore" });
  } catch {
    fail("iconutil not found — install Xcode CLI tools");
  }
  try {
    execFileSync("swift", ["--version"], { stdio: "ignore" });
  } catch {
    fail("swift not found — install Xcode CLI tools");
  }
}

function fail(msg) {
  console.error(`[icon:build] ${msg}`);
  process.exit(1);
}

function render(size, scale, outPath) {
  execFileSync(
    ICTOOL,
    [
      SOURCE,
      "--export-image",
      "--output-file", outPath,
      "--platform", "macOS",
      "--rendition", "Default",
      "--width", String(size),
      "--height", String(size),
      "--scale", String(scale),
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

function pad(input, output, canvas, content) {
  execFileSync("swift", [PAD_SCRIPT, input, output, String(canvas), String(content)], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function main() {
  check();
  console.log(`[icon:build] source: ${SOURCE}`);

  rmSync(ICONSET, { recursive: true, force: true });
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(ICONSET, { recursive: true });
  mkdirSync(RAW, { recursive: true });
  mkdirSync(RESOURCES_DIR, { recursive: true });

  for (const size of SIZES) {
    for (const scale of [1, 2]) {
      const px = size * scale;
      const content = Math.round((px * CONTENT_PERCENT) / 100);
      const suffix = scale === 2 ? "@2x" : "";
      const stem = `icon_${size}x${size}${suffix}`;
      const raw = path.join(RAW, `${stem}.png`);
      const final = path.join(ICONSET, `${stem}.png`);
      render(size, scale, raw);
      pad(raw, final, px, content);
    }
  }

  const icnsOut = path.join(RESOURCES_DIR, "icon.icns");
  execFileSync("iconutil", ["-c", "icns", ICONSET, "-o", icnsOut], { stdio: "inherit" });

  // 1024 master PNG for Linux / Windows / Electron dev-mode fallback.
  const masterRaw = path.join(RAW, "master.png");
  const masterOut = path.join(RESOURCES_DIR, "icon.png");
  render(1024, 1, masterRaw);
  pad(masterRaw, masterOut, 1024, Math.round((1024 * CONTENT_PERCENT) / 100));

  console.log(`[icon:build] wrote ${icnsOut}`);
  console.log(`[icon:build] wrote ${masterOut}`);
}

main();
