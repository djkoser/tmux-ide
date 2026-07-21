# tmux-ide

[![CI](https://github.com/wavyrai/tmux-ide/actions/workflows/ci.yml/badge.svg)](https://github.com/wavyrai/tmux-ide/actions/workflows/ci.yml)

Turn any project into a tmux-powered terminal IDE with a simple `ide.yml` config file.

## Install

```bash
npm install -g tmux-ide
```

Global install also registers the bundled Claude Code skill and enables `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `~/.claude/settings.json` if Claude Code is installed locally on the machine.

## Quick Start

```bash
tmux-ide init         # Scaffold ide.yml (auto-detects your stack)
tmux-ide              # Launch the IDE
tmux-ide stop         # Kill the session
tmux-ide restart      # Stop and relaunch
tmux-ide attach       # Reattach to a running session
tmux-ide inspect      # Inspect effective config + runtime state
```

## ide.yml Format

```yaml
name: project-name # tmux session name

before: pnpm install # optional pre-launch hook

rows:
  - size: 70% # row height percentage
    panes:
      - title: Editor # pane border label
        command: vim # command to run (optional)
        size: 60% # pane width percentage (optional)
        dir: apps/web # per-pane working directory (optional)
        focus: true # initial focus (optional)
        env: # environment variables (optional)
          PORT: 3000
      - title: Shell

  - panes:
      - title: Dev Server
        command: pnpm dev
      - title: Tests
        command: pnpm test

theme: # optional color overrides
  accent: colour75
  border: colour238
  bg: colour235
  fg: colour248
```

## Commands

| Command                                            | Description                             |
| -------------------------------------------------- | --------------------------------------- |
| `tmux-ide`                                         | Launch IDE from `ide.yml`               |
| `tmux-ide <path>`                                  | Launch from a specific directory        |
| `tmux-ide init [--template <name>]`                | Scaffold a new `ide.yml`                |
| `tmux-ide stop`                                    | Kill the current IDE session            |
| `tmux-ide restart`                                 | Stop and relaunch the IDE session       |
| `tmux-ide attach`                                  | Reattach to a running session           |
| `tmux-ide ls`                                      | List all tmux sessions                  |
| `tmux-ide status`                                  | Show session status                     |
| `tmux-ide inspect`                                 | Show effective config and runtime state |
| `tmux-ide doctor`                                  | Check system requirements               |
| `tmux-ide validate`                                | Validate `ide.yml`                      |
| `tmux-ide detect`                                  | Detect project stack and explain why    |
| `tmux-ide detect --write`                          | Detect and write `ide.yml`              |
| `tmux-ide config`                                  | Dump config as JSON                     |
| `tmux-ide config set <path> <value>`               | Set a config value                      |
| `tmux-ide config add-pane --row <N>`               | Add a pane to a row                     |
| `tmux-ide config remove-pane --row <N> --pane <M>` | Remove a pane                           |
| `tmux-ide config add-row [--size <percent>]`       | Add a new row                           |
| `tmux-ide config enable-team --name <name>`        | Enable agent teams                      |
| `tmux-ide config disable-team`                     | Disable agent teams                     |
| `tmux-ide send <target> <message>`                 | Send a message to an agent pane         |
| `tmux-ide recv <msgId>`                            | Receive a message (recipient side)      |
| `tmux-ide inbox list <recipient>`                  | List pending inbox messages             |
| `tmux-ide inbox watch <recipient>`                 | Block until a message is pending        |

All commands support `--json` for structured output.

`tmux-ide detect` now includes reasoning about the package manager, language, framework, and dev-command signals it used. `tmux-ide inspect` combines config validation, resolved layout details, and live tmux state in one command.

## Agent Messaging & Inbox Delivery

`tmux-ide send` delivers to agent panes through a durable message store
(envelopes in `.tasks/messages/outbox/`, receipts written by
`tmux-ide recv <msgId>`); the sender polls the receipt and reports
`delivered`, `duplicate`, `superseded`, or `failed`.

A pane flagged `inbox: true` in `ide.yml` gets envelope-only delivery: `send`
never pastes into the pane, so a human typing in that pane's composer
(typically the lead) is never interrupted. `--inbox` / `--no-inbox` on `send`
force the mode for a single message.

The inbox recipient's lifecycle is event-driven:

1. At session start, the pane's agent launches
   `tmux-ide inbox watch <name>` as a Claude Code background Bash task.
2. The watcher exits as soon as messages are pending — immediately at start
   if any queued up while no watcher was running (catch-up) — which
   re-invokes the agent via the task notification.
3. The agent runs `tmux-ide recv <id>` per message, handles it, and
   relaunches the watcher.

For inbox recipients a `failed` send outcome means not yet acked: the
envelope stays pending and is picked up on the recipient's next watch/recv
cycle.

## Templates

Use `tmux-ide init --template <name>` with one of:

- `default` - General-purpose layout
- `nextjs` - Next.js development
- `convex` - Convex + Next.js
- `vite` - Vite project
- `python` - Python development
- `go` - Go development
- `agent-team` - Agent team with lead + teammates
- `agent-team-nextjs` - Agent team for Next.js
- `agent-team-monorepo` - Agent team for monorepos

## Contributor Workflow

The repo now uses a pnpm workspace with a root CLI package and a separate docs app package:

```bash
pnpm install
pnpm test
pnpm docs:build
pnpm check
pnpm pack:check
```

`pnpm check` is the intended local pre-push command and matches the default release checklist. `npm publish` is still guarded by `prepublishOnly`, so publishing runs the same full check path automatically.

## CI

GitHub Actions validates:

- the Node CLI test suite on Node 18, 20, and 22
- the docs site production build
- the package can be packed successfully with `npm pack --dry-run`

That keeps the release surface small but catches the main regressions for a CLI-first package.

## Open Source Project Files

- [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and contribution workflow
- [RELEASE.md](RELEASE.md) for the publish checklist
- [CHANGELOG.md](CHANGELOG.md) for release notes
- [SECURITY.md](SECURITY.md) for vulnerability reporting

Release note convention:

- Keep the next version under an `Unreleased` heading in `CHANGELOG.md` until the tag is cut.
- Move it to a dated release entry when the release is actually published.

## Requirements

- **tmux** >= 3.0
- **Node.js** >= 18

## License

[MIT](LICENSE)
