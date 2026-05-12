import { describe, expect, it, vi, afterEach } from "vitest";
import { ActionInvocationError, dispatch } from "../actionClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("dispatch (action client)", () => {
  it("returns the typed result on a successful envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: {
          sessionName: "alpha",
          cwd: "/repos/alpha",
          terminalTabId: "terminal:alpha:default",
          launched: false,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await dispatch("project.openTerminal", { name: "alpha" });

    expect(result).toEqual({
      sessionName: "alpha",
      cwd: "/repos/alpha",
      terminalTabId: "terminal:alpha:default",
      launched: false,
    });
    // POSTs to the typed endpoint with the input as JSON body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v2/action/project.openTerminal");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ name: "alpha" });
  });

  it("throws ActionInvocationError with code=project_not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            error: {
              code: "project_not_found",
              message: 'Project "missing" is not registered',
            },
          },
          404,
        ),
      ),
    );

    await expect(dispatch("project.openTerminal", { name: "missing" })).rejects.toMatchObject({
      name: "ActionInvocationError",
      code: "project_not_found",
      action: "project.openTerminal",
    });
  });

  it("throws ActionInvocationError with code=cwd_not_found and preserves details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: false,
          error: {
            code: "cwd_not_found",
            message: "cwd does not exist",
            details: { cwd: "/gone", reason: "notFound" },
          },
        }),
      ),
    );

    let thrown: ActionInvocationError | null = null;
    try {
      await dispatch("project.launch", { name: "alpha" });
    } catch (err) {
      thrown = err as ActionInvocationError;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.code).toBe("cwd_not_found");
    expect(thrown!.details).toEqual({ cwd: "/gone", reason: "notFound" });
  });

  it("throws an internal-coded error when the server returns a malformed envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ random: "garbage" })));

    let thrown: ActionInvocationError | null = null;
    try {
      await dispatch("terminal.stop", {
        sessionName: "alpha",
        terminalId: "terminal:alpha:default",
      });
    } catch (err) {
      thrown = err as ActionInvocationError;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.code).toBe("internal");
    expect(thrown!.action).toBe("terminal.stop");
  });

  it("rethrows native fetch errors transparently", async () => {
    const networkError = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(dispatch("project.stop", { name: "alpha" })).rejects.toBe(networkError);
  });

  it("sends the remote access bearer token when present", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { hostname: "desk.local", protocol: "http:", search: "?token=tok_action" },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        result: { sessionName: "alpha", started: false },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await dispatch("project.launch", { name: "alpha" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.Authorization).toBe("Bearer tok_action");
  });
});
