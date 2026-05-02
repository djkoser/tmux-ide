import { afterEach, describe, expect, it } from "bun:test";
import { once } from "node:events";
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
});
