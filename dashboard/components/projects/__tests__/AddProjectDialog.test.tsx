import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = {
  name: "alpha",
  dir: "/repos/alpha",
  hasIdeYml: true,
  gitOrigin: "git@github.com:owner/alpha.git",
  gitBranch: "main",
  registeredAt: "2026-05-01T00:00:00Z",
};

const HOME_LISTING = {
  path: "/Users/test",
  parentPath: "/Users",
  entries: [
    {
      name: "alpha",
      fullPath: "/repos/alpha",
      isDir: true,
      isSymlink: false,
    },
    {
      name: "freshproj",
      fullPath: "/repos/freshproj",
      isDir: true,
      isSymlink: false,
    },
  ],
};

vi.mock("@/lib/api", () => ({
  fetchProjects: vi.fn(async () => [] as (typeof PROJECT)[]),
  fetchProjectTemplates: vi.fn(async () => [
    { id: "nextjs", label: "Next.js", description: "Next + Convex" },
    { id: "node", label: "Node.js", description: "Plain Node" },
  ]),
  initProject: vi.fn(async () => ({ jobId: "job-123" })),
  probeProject: vi.fn(async () => PROJECT),
  registerProject: vi.fn(async () => PROJECT),
  fetchFilesystem: vi.fn(async (path?: string) => {
    // Walking into a child returns an "empty" listing rooted at that path so
    // the browser commits the navigated-into path instead of bouncing back.
    if (path === "/repos/alpha") {
      return { path: "/repos/alpha", parentPath: "/Users/test", entries: [] };
    }
    if (path === "/repos/freshproj") {
      return { path: "/repos/freshproj", parentPath: "/Users/test", entries: [] };
    }
    return HOME_LISTING;
  }),
  ProjectApiError: class extends Error {},
}));

vi.mock("@/lib/wsBus", () => ({
  subscribeGlobal: vi.fn(() => () => undefined),
}));

vi.mock("@/lib/useToasts", () => ({
  useToasts: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/navigation", () => ({
  setNavigation: vi.fn(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const { __resetAddProjectDialogStoreForTests, openAddProjectDialog } =
    await import("@/lib/addProjectDialogStore");
  __resetAddProjectDialogStoreForTests();
  const { __resetProjectStoreForTests } = await import("@/lib/projectStore");
  __resetProjectStoreForTests();
  const { __resetSettingsForTests } = await import("@/lib/useSettings");
  __resetSettingsForTests();
  openAddProjectDialog();
});

afterEach(async () => {
  const { __resetAddProjectDialogStoreForTests } = await import("@/lib/addProjectDialogStore");
  __resetAddProjectDialogStoreForTests();
});

async function renderDialog() {
  const { AddProjectDialog } = await import("../AddProjectDialog");
  return render(<AddProjectDialog />);
}

describe("AddProjectDialog", () => {
  it("renders the three tab buttons when open", async () => {
    await renderDialog();
    await waitFor(() => {
      expect(screen.getByTestId("add-project-dialog")).toBeTruthy();
    });
    expect(screen.getByTestId("add-project-tab-open")).toBeTruthy();
    expect(screen.getByTestId("add-project-tab-init")).toBeTruthy();
    expect(screen.getByTestId("add-project-tab-clone")).toBeTruthy();
  });

  it("starts on the 'open' tab and switches when init is clicked", async () => {
    await renderDialog();
    await waitFor(() => {
      expect(screen.getByTestId("add-project-tab-open").getAttribute("data-active")).toBe("true");
    });

    fireEvent.click(screen.getByTestId("add-project-tab-init"));

    await waitFor(() => {
      expect(screen.getByTestId("add-project-tab-init").getAttribute("data-active")).toBe("true");
    });
    expect(screen.getByTestId("add-project-template-select")).toBeTruthy();
  });

  it("renders the directory browser on the open tab", async () => {
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-alpha")).toBeTruthy());
  });

  it("probes when the user commits via the browser select", async () => {
    const { probeProject } = await import("@/lib/api");
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-alpha")).toBeTruthy());

    fireEvent.click(screen.getByTestId("directory-browser-entry-alpha"));
    // Wait for the navigation to land before committing.
    await waitFor(() => {
      expect(screen.getByTestId("directory-browser-path").getAttribute("title")).toBe(
        "/repos/alpha",
      );
    });
    fireEvent.click(screen.getByTestId("directory-browser-select"));

    await waitFor(() => {
      expect(probeProject).toHaveBeenCalledWith("/repos/alpha");
    });
    await waitFor(() => {
      expect(screen.getByText(/git@github.com:owner\/alpha\.git/)).toBeTruthy();
    });
  });

  it("registers a project when Add is clicked after committing the browser", async () => {
    const { registerProject } = await import("@/lib/api");
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-alpha")).toBeTruthy());

    fireEvent.click(screen.getByTestId("directory-browser-entry-alpha"));
    await waitFor(() => {
      expect(screen.getByTestId("directory-browser-path").getAttribute("title")).toBe(
        "/repos/alpha",
      );
    });
    fireEvent.click(screen.getByTestId("directory-browser-select"));

    const submit = await screen.findByTestId("add-project-submit");
    await waitFor(() => {
      expect(submit.getAttribute("disabled")).toBeNull();
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(registerProject).toHaveBeenCalledWith("/repos/alpha", "alpha");
    });
  });

  it("shows the clone tab as coming soon (disabled submit)", async () => {
    await renderDialog();
    fireEvent.click(screen.getByTestId("add-project-tab-clone"));

    const submit = await screen.findByTestId("add-project-submit");
    expect(submit.getAttribute("disabled")).not.toBeNull();
  });

  it("renders the directory browser on the init tab", async () => {
    await renderDialog();
    fireEvent.click(screen.getByTestId("add-project-tab-init"));
    await waitFor(() => expect(screen.getByTestId("directory-browser")).toBeTruthy());
  });

  it("calls initProject when init submit is clicked", async () => {
    const { initProject } = await import("@/lib/api");
    await renderDialog();
    fireEvent.click(screen.getByTestId("add-project-tab-init"));
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-freshproj")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("directory-browser-entry-freshproj"));
    await waitFor(() => {
      expect(screen.getByTestId("directory-browser-path").getAttribute("title")).toBe(
        "/repos/freshproj",
      );
    });
    fireEvent.click(screen.getByTestId("directory-browser-select"));

    const submit = await screen.findByTestId("add-project-submit");
    await waitFor(() => {
      expect(submit.getAttribute("disabled")).toBeNull();
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(initProject).toHaveBeenCalledWith("/repos/freshproj", undefined);
    });
  });
});
