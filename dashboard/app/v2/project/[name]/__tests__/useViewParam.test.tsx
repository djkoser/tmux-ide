import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { useViewParam } from "@/app/v2/project/[name]/useViewParam";

// ---------------------------------------------------------------------------
// next/navigation mock — `useSearchParams` reads from window.location so
// it reflects whatever we write via `router.replace` (which delegates
// to window.history.replaceState). That mirrors how Next's client
// router behaves in practice for in-page URL updates.
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => {
  function getSearchParams(): URLSearchParams {
    return new URLSearchParams(window.location.search);
  }
  return {
    useSearchParams: () => {
      // Return a fresh URLSearchParams each call so React sees a new
      // value when the URL changes — the consumer reads `.get("view")`
      // which is a fresh string per read, so reference equality is
      // immaterial.
      return getSearchParams();
    },
    useRouter: () => ({
      replace: (url: string) => {
        const next = new URL(url, window.location.href);
        window.history.replaceState(null, "", next.toString());
        // Force a re-render in the test harness by dispatching popstate.
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
    }),
  };
});

type View = "kanban" | "chat" | "files" | "tasks";
const ALL_VIEWS = new Set<string>(["kanban", "chat", "files", "tasks"]);
const isView = (v: string): v is View => ALL_VIEWS.has(v);

function Harness() {
  const [view, setView] = useViewParam<View>("kanban", isView);
  return (
    <div>
      <span data-testid="view">{view}</span>
      <button data-testid="go-chat" onClick={() => setView("chat")}>
        chat
      </button>
      <button data-testid="go-files" onClick={() => setView("files")}>
        files
      </button>
      <button data-testid="go-kanban" onClick={() => setView("kanban")}>
        kanban
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  // Reset URL between tests so each starts from a clean canonical path.
  window.history.replaceState(null, "", "/v2/project/demo");
});

describe("useViewParam — URL ↔ state binding", () => {
  it("returns the default view when the ?view= param is absent", () => {
    window.history.replaceState(null, "", "/v2/project/demo");
    render(<Harness />);
    expect(screen.getByTestId("view").textContent).toBe("kanban");
  });

  it("returns the value from ?view= when present and valid", () => {
    window.history.replaceState(null, "", "/v2/project/demo?view=chat");
    render(<Harness />);
    expect(screen.getByTestId("view").textContent).toBe("chat");
  });

  it("falls back to the default when ?view= holds an unknown id", () => {
    window.history.replaceState(null, "", "/v2/project/demo?view=bogus");
    render(<Harness />);
    expect(screen.getByTestId("view").textContent).toBe("kanban");
  });

  it("setView writes ?view=<id> into the URL via router.replace", () => {
    window.history.replaceState(null, "", "/v2/project/demo");
    render(<Harness />);
    fireEvent.click(screen.getByTestId("go-chat"));
    expect(window.location.search).toBe("?view=chat");
  });

  it("setting back to the default view DROPS the param so canonical URL stays clean", () => {
    window.history.replaceState(null, "", "/v2/project/demo?view=chat");
    render(<Harness />);
    expect(screen.getByTestId("view").textContent).toBe("chat");
    fireEvent.click(screen.getByTestId("go-kanban"));
    expect(window.location.search).toBe("");
  });

  it("preserves other query-string params when updating ?view=", () => {
    window.history.replaceState(null, "", "/v2/project/demo?task=001&tab=kanban");
    render(<Harness />);
    fireEvent.click(screen.getByTestId("go-files"));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("view")).toBe("files");
    expect(params.get("task")).toBe("001");
    expect(params.get("tab")).toBe("kanban");
  });

  it("uses router.replace (not push) — back-button doesn't accumulate view changes", () => {
    // We can't directly inspect history depth via jsdom, but we can verify
    // the URL changes without a navigation by checking that the same
    // origin path stays put across two sequential setView calls.
    window.history.replaceState(null, "", "/v2/project/demo");
    const beforeLen = window.history.length;
    render(<Harness />);
    fireEvent.click(screen.getByTestId("go-chat"));
    fireEvent.click(screen.getByTestId("go-files"));
    fireEvent.click(screen.getByTestId("go-chat"));
    // jsdom's history.length increments only on push; replace keeps it
    // bounded. Tolerate +/-1 since the test harness may have its own
    // entry.
    expect(window.history.length).toBeLessThanOrEqual(beforeLen + 1);
  });
});
