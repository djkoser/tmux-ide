# @tmux-ide/app-electron

Electron desktop shell for tmux-ide.

## Architecture

- **Loader** (`src/loader.ts` → `dist-electron/loader.cjs`) — entry point
  declared in `package.json`'s `main` field. Installs persistent
  log files at `~/Library/Logs/tmux-ide/{loader,app}.log` *before*
  `require`ing the main bundle so silent-exit modes still leave a
  debuggable trail.
- **Main process** (`src/main.ts` → `dist-electron/main.cjs`) —
  attaches to (or starts) the canonical daemon, registers the
  `app://` protocol, builds the menu, and opens the
  BrowserWindow.
- **Daemon bridge** (`src/daemon-bridge.ts`) — discover-first
  attachment. If `~/.tmux-ide/daemon.json` describes a live
  canonical daemon, the app reuses it (no second daemon process,
  no port contention). Otherwise it falls back to
  `startEmbeddedDaemon` so a standalone `.app` launch still works.
- **Preload** (`src/preload.ts` → `dist-electron/preload.cjs`) —
  runs in the renderer's isolated world. Exposes
  `window.__TMUX_IDE__` so the dashboard knows which port to talk
  to without env-var gymnastics.
- **Menu** (`src/menu.ts`) — pure factory `buildMenuTemplate(…)`
  that produces a `MenuItemConstructorOptions[]`. Tested directly;
  no Electron import at test time.
- **IPC** (`src/ipc.ts`) — single typed contract for renderer ↔
  main messages: menu events (`menu:add-project`,
  `menu:open-settings`) and updater status
  (`app:check-for-updates`, `app:update-status`).

## Dev workflow

The desktop app is one half of a two-process dev loop:

```bash
# Terminal 1: Next.js dev server (the dashboard).
pnpm --filter @tmux-ide/dashboard dev               # serves :3000

# Terminal 2: Build + watch the Electron bundle, then launch.
pnpm --filter @tmux-ide/app-electron dev            # tsdown --watch + Electron
```

The `dev:electron` script defaults
`TMUX_IDE_DASHBOARD_DEV_URL=http://localhost:3000` when the env
var is not set, so the BrowserWindow loads the live Next.js dev
server. To load the static export instead, leave
`TMUX_IDE_DASHBOARD_DEV_URL` blank and run `pnpm --filter
@tmux-ide/dashboard build` first.

The daemon does not need to be started separately. If you already
have one running (`tmux-ide` from a terminal, or `pnpm --filter
@tmux-ide/daemon dev`), the app's `attachOrStartDaemon` will pick
it up via `~/.tmux-ide/daemon.json` and skip the embedded path.

## Environment variables

| Var | Effect |
| --- | --- |
| `TMUX_IDE_DASHBOARD_DEV_URL` | Load the dashboard from this URL instead of `app://-/index.html`. `dev-electron.mjs` defaults this to `http://localhost:3000`. |
| `TMUX_IDE_FORCE_EMBED` | When set to `1`, skip canonical-daemon discovery and always `startEmbeddedDaemon`. Used for isolated testing. |
| `TMUX_IDE_BIND_HOSTNAME` | Set to `0.0.0.0` to bind the embedded daemon to all interfaces. Default is the daemon's choice based on `app-settings.json`. |
| `TMUX_IDE_HIDE_DEVTOOLS` | When set, suppress the auto-open of DevTools on the main window. |
| `TMUX_IDE_DAEMON_PORT` | Set by `main.ts` after daemon attach; read by `preload.ts`. **Do not set manually** — it is part of the main ↔ preload contract. |
| `TMUX_IDE_LOCAL_BYPASS_TOKEN` | Same — set by main, read by preload. |
| `TMUX_IDE_APP_VERSION` | Same. |

## IPC surface

Renderer-side (exposed as `window.__TMUX_IDE__` by `preload.ts`):

```ts
interface TmuxIdePreload {
  port: number;                                  // canonical daemon port
  version: string;                               // app.getVersion()
  localBypassToken: string | null;               // authorises localhost-only API calls
  apiBaseUrl: string;                            // `http://127.0.0.1:<port>`
  wsUrl: string;                                 // `ws://127.0.0.1:<port>/ws/events`
  on(channel: MenuEventChannel, handler: () => void): () => void;
  checkForUpdates(): Promise<void>;
  onUpdateStatus(handler: (payload: AppUpdateStatusPayload) => void): () => void;
}

type MenuEventChannel = "menu:add-project" | "menu:open-settings";

interface AppUpdateStatusPayload {
  status: "idle" | "checking" | "update-available" | "no-update" | "update-downloaded" | "error";
  message?: string;
}
```

The two channels are the entire main-→-renderer surface today.
Adding a new channel is a four-step change:

1. Add the literal to `MENU_EVENT_CHANNELS` in `ipc.ts`.
2. Add the menu-item `click` handler in `menu.ts`.
3. Add the corresponding `send` call site in `main.ts` (if needed
   outside the menu — e.g. from `before-quit`).
4. Subscribe in the dashboard via
   `window.__TMUX_IDE__.on("menu:my-channel", handler)`.

Renderer-→-main today is just `checkForUpdates()` and the menu
events flowing the other way; no other invokes are wired.

## Packaging

```bash
# Build the dashboard's static export FIRST (electron-builder
# pulls it in via extraResources).
pnpm --filter @tmux-ide/dashboard build

# Bundle the Electron main + preload + loader.
pnpm --filter @tmux-ide/app-electron build

# Produce .dmg + .zip artifacts under `release/`.
pnpm --filter @tmux-ide/app-electron package:mac
```

`tsdown` is configured to **bundle** workspace packages
(`@tmux-ide/daemon`, `@tmux-ide/contracts`, …) into `main.cjs`
via `noExternal: [/^@tmux-ide\//]`. This sidesteps the standard
electron-builder + pnpm-workspace headache (electron-builder
cannot pack symlinks whose targets resolve outside the package's
own directory). Native modules (`node-pty`,
`better-sqlite3`, `@parcel/watcher`) remain external and ship via
`asarUnpack` in `electron-builder.yml`.

## Known limitations / next tasks

- Tray icon + dock badge: not wired.
- Auto-update channel: `electron-updater` is configured but the
  release flow is not yet automated.
- macOS code-signing + notarisation: `package:mac` runs through
  the build step and produces `release/mac-arm64/tmux-ide.app`
  before reaching the signing step. Signing fails locally with
  identity `E1B5E06AAB30…3514` when the Apple Developer keychain
  entries are not provisioned — the unsigned `.app` is still
  produced and runnable. Set `CSC_LINK` + `CSC_KEY_PASSWORD` and
  the Apple notarisation env (`APPLE_ID`, `APPLE_ID_PASSWORD`,
  `APPLE_TEAM_ID`) to get a signed + notarised DMG.
