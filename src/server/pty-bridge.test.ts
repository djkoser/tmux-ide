import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter, once } from "node:events";
import { PtyBridge, type PtyExit } from "./pty-bridge.ts";

const bridges: PtyBridge[] = [];

function makeBridge(args: string[] = ["-i"]): PtyBridge {
  const bridge = new PtyBridge({
    shell: "/bin/sh",
    args,
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TERM: "xterm-256color",
    },
  });
  bridges.push(bridge);
  return bridge;
}

async function waitForOutput(bridge: PtyBridge, needle: string, timeoutMs = 5000): Promise<string> {
  let collected = "";

  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      bridge.off("output", onOutput);
      reject(new Error(`Timed out waiting for output: ${needle}\n${collected}`));
    }, timeoutMs);

    const onOutput = (bytes: Buffer) => {
      collected += bytes.toString("utf8");
      if (collected.includes(needle)) {
        clearTimeout(timeout);
        bridge.off("output", onOutput);
        resolve(collected);
      }
    };

    bridge.on("output", onOutput);
  });
}

afterEach(() => {
  for (const bridge of bridges.splice(0)) {
    bridge.kill("SIGKILL");
  }
});

describe("PtyBridge", () => {
  it("spawns a real shell with requested dimensions", () => {
    const bridge = makeBridge();
    bridge.spawn(80, 24);

    expect(bridge.running).toBe(true);
    expect(bridge.pid).toBeGreaterThan(0);
    expect(bridge.cols).toBe(80);
    expect(bridge.rows).toBe(24);
  });

  it("writes input bytes and emits shell output", async () => {
    const bridge = makeBridge();
    bridge.spawn(80, 24);

    bridge.write(Buffer.from("echo tmux-ide-pty\r"));

    const output = await waitForOutput(bridge, "tmux-ide-pty");
    expect(output).toContain("tmux-ide-pty");
  });

  it("resizes the PTY", () => {
    const bridge = makeBridge();
    bridge.spawn(80, 24);

    bridge.resize(120, 40);

    expect(bridge.cols).toBe(120);
    expect(bridge.rows).toBe(40);
  });

  it("emits exit when the process terminates", async () => {
    const bridge = new PtyBridge({ shell: "/bin/sleep", args: ["60"], cwd: process.cwd() });
    bridges.push(bridge);
    const exitPromise = once(bridge, "exit") as Promise<[PtyExit]>;
    bridge.spawn(80, 24);
    bridge.kill("SIGTERM");

    const [exit] = await exitPromise;
    expect(exit.code).toBeNumber();
    expect(exit.signal).toBeNumber();
    expect(bridge.running).toBe(false);
  });

  it("terminates a running process with SIGTERM", async () => {
    const bridge = makeBridge(["-c", "trap 'exit 42' TERM; while true; do sleep 1; done"]);
    bridge.spawn(80, 24);

    const exitPromise = once(bridge, "exit") as Promise<[PtyExit]>;
    bridge.kill("SIGTERM");

    const [exit] = await exitPromise;
    expect(exit.code === 42 || exit.signal !== null).toBe(true);
    expect(bridge.running).toBe(false);
  });

  it("spawns the requested command in the requested cwd", () => {
    const spawnCalls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> =
      [];
    const fakePty = new EventEmitter() as EventEmitter & {
      pid: number;
      cols: number;
      rows: number;
      write: (data: string | Buffer) => void;
      resize: (cols: number, rows: number) => void;
      kill: (signal?: NodeJS.Signals) => void;
      onData: (listener: (data: unknown) => void) => { dispose: () => void };
      onExit: (listener: (exit: { exitCode: number; signal?: number | null }) => void) => {
        dispose: () => void;
      };
    };
    fakePty.pid = 12345;
    fakePty.cols = 100;
    fakePty.rows = 30;
    fakePty.write = () => undefined;
    fakePty.resize = (cols, rows) => {
      fakePty.cols = cols;
      fakePty.rows = rows;
    };
    fakePty.kill = () => undefined;
    fakePty.onData = (listener) => {
      fakePty.on("data", listener);
      return { dispose: () => fakePty.off("data", listener) };
    };
    fakePty.onExit = (listener) => {
      fakePty.on("exit", listener);
      return { dispose: () => fakePty.off("exit", listener) };
    };

    const bridge = new PtyBridge({
      env: { PATH: process.env.PATH, TERM: "xterm-256color" },
      pty: {
        spawn: (command, args, options) => {
          spawnCalls.push({ command, args, options: options as Record<string, unknown> });
          return fakePty as never;
        },
      },
    });
    bridges.push(bridge);

    bridge.spawn(100, 30, { cwd: "/tmp/project-dir", cmd: ["tmux-ide", "--flag"] });
    bridge.resize(120, 40);

    expect(bridge.running).toBe(true);
    expect(bridge.pid).toBe(12345);
    expect(bridge.cols).toBe(120);
    expect(bridge.rows).toBe(40);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.command).toBe("tmux-ide");
    expect(spawnCalls[0]?.args).toEqual(["--flag"]);
    expect(spawnCalls[0]?.options.cwd).toBe("/tmp/project-dir");
    expect(spawnCalls[0]?.options.cols).toBe(100);
    expect(spawnCalls[0]?.options.rows).toBe(30);
  });
});
