import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAction } from "../useAction";

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useAction", () => {
  it("transitions idle → pending → success and stores lastResult", async () => {
    let resolveFetch: ((value: Response) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const { result } = renderHook(() => useAction("project.launch"));
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastResult).toBeNull();

    let dispatched: Promise<unknown> | undefined;
    act(() => {
      dispatched = result.current.dispatch({ name: "alpha" });
    });

    // pending after dispatch starts
    await waitFor(() => expect(result.current.pending).toBe(true));

    // resolve the in-flight request
    act(() => {
      resolveFetch!(jsonResponse({ ok: true, result: { sessionName: "alpha", started: true } }));
    });

    await dispatched!;

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.lastResult).toEqual({ sessionName: "alpha", started: true });
    expect(result.current.error).toBeNull();
  });

  it("transitions idle → pending → error when the server returns a failure envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            error: {
              code: "project_not_found",
              message: 'Project "ghost" is not registered',
            },
          },
          404,
        ),
      ),
    );

    const { result } = renderHook(() => useAction("project.openTerminal"));

    await act(async () => {
      const value = await result.current.dispatch({ name: "ghost" });
      expect(value).toBeNull();
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.name).toBe("ActionInvocationError");
    expect((result.current.error as { code?: string }).code).toBe("project_not_found");
    expect(result.current.lastResult).toBeNull();
  });

  it("clears the error on the next dispatch start", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ok: false, error: { code: "internal", message: "boom" } }, 500),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, result: { sessionName: "alpha", stopped: true } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAction("project.stop"));

    await act(async () => {
      await result.current.dispatch({ name: "alpha" });
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.dispatch({ name: "alpha" });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.lastResult).toEqual({ sessionName: "alpha", stopped: true });
  });
});
