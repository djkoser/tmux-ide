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

const PROJECT_FRESH = {
  name: "freshproj",
  dir: "/repos/freshproj",
  hasIdeYml: false,
  gitOrigin: null,
  gitBranch: null,
  registeredAt: "2026-05-01T00:00:00Z",
};

const INSPECT_ALPHA = {
  name: "alpha",
  dir: "/repos/alpha",
  hasIdeYml: true,
  gitOrigin: "git@github.com:owner/alpha.git",
  gitBranch: "main",
  detected: {
    packageManager: "pnpm" as const,
    frameworks: ["next"],
    devCommand: "pnpm dev",
    testCommand: "pnpm test",
  },
};

const INSPECT_FRESH = {
  name: "freshproj",
  dir: "/repos/freshproj",
  hasIdeYml: false,
  gitOrigin: null,
  gitBranch: null,
  detected: {
    packageManager: "pnpm" as const,
    frameworks: ["next"],
    devCommand: "pnpm dev",
    testCommand: "pnpm test",
  },
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
  inspectDirectory: vi.fn(async (path: string) => {
    if (path === "/repos/freshproj") return INSPECT_FRESH;
    return INSPECT_ALPHA;
  }),
  onboardProject: vi.fn(async () => PROJECT_FRESH),
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
    // Init tab opens on the pick panel — directory browser shows; template
    // picker is gated behind committing a folder.
    expect(screen.getByTestId("add-project-panel-init-pick")).toBeTruthy();
    expect(screen.queryByTestId("add-project-template-select")).toBeNull();
  });

  it("starts on the pick panel with no wizard, preview, or submit visible", async () => {
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser")).toBeTruthy());

    // Only the pick panel is rendered.
    expect(screen.getByTestId("add-project-panel-pick")).toBeTruthy();
    // Panels for confirm / onboard / init are not in the tree yet.
    expect(screen.queryByTestId("add-project-panel-confirm")).toBeNull();
    expect(screen.queryByTestId("add-project-panel-onboard")).toBeNull();
    expect(screen.queryByTestId("onboarding-wizard")).toBeNull();
    expect(screen.queryByTestId("add-project-preview")).toBeNull();
    expect(screen.queryByTestId("add-project-submit")).toBeNull();
    // Pick footer is the active footer — Cancel only.
    expect(screen.getByTestId("add-project-footer-pick")).toBeTruthy();
  });

  it("advances pick → confirm when picked dir has ide.yml", async () => {
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-alpha")).toBeTruthy());

    fireEvent.click(screen.getByTestId("directory-browser-entry-alpha"));
    await waitFor(() => {
      expect(screen.getByTestId("directory-browser-path").getAttribute("title")).toBe(
        "/repos/alpha",
      );
    });
    fireEvent.click(screen.getByTestId("directory-browser-select"));

    await waitFor(() => {
      expect(screen.getByTestId("add-project-panel-confirm")).toBeTruthy();
    });
    // Pick panel is gone — only one panel visible at a time.
    expect(screen.queryByTestId("add-project-panel-pick")).toBeNull();
    expect(screen.getByTestId("add-project-preview")).toBeTruthy();
    expect(screen.getByTestId("add-project-back")).toBeTruthy();
    expect(screen.getByTestId("add-project-submit")).toBeTruthy();
    // Breadcrumb appears with a Change action that pops back to pick.
    expect(screen.getByTestId("add-project-breadcrumb")).toBeTruthy();
  });

  it("Back button on confirm pops back to pick panel", async () => {
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-alpha")).toBeTruthy());

    fireEvent.click(screen.getByTestId("directory-browser-entry-alpha"));
    await waitFor(() => {
      expect(screen.getByTestId("directory-browser-path").getAttribute("title")).toBe(
        "/repos/alpha",
      );
    });
    fireEvent.click(screen.getByTestId("directory-browser-select"));
    await waitFor(() => expect(screen.getByTestId("add-project-panel-confirm")).toBeTruthy());

    fireEvent.click(screen.getByTestId("add-project-back"));

    await waitFor(() => {
      expect(screen.getByTestId("add-project-panel-pick")).toBeTruthy();
    });
    expect(screen.queryByTestId("add-project-panel-confirm")).toBeNull();
  });

  it("breadcrumb Change action returns to pick panel", async () => {
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-alpha")).toBeTruthy());

    fireEvent.click(screen.getByTestId("directory-browser-entry-alpha"));
    await waitFor(() => {
      expect(screen.getByTestId("directory-browser-path").getAttribute("title")).toBe(
        "/repos/alpha",
      );
    });
    fireEvent.click(screen.getByTestId("directory-browser-select"));
    await waitFor(() => expect(screen.getByTestId("add-project-panel-confirm")).toBeTruthy());

    fireEvent.click(screen.getByTestId("add-project-breadcrumb-change"));

    await waitFor(() => {
      expect(screen.getByTestId("add-project-panel-pick")).toBeTruthy();
    });
  });

  it("when picked dir has no ide.yml, the wizard panel takes over and the dialog footer hides", async () => {
    await renderDialog();
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

    await waitFor(() => {
      expect(screen.getByTestId("add-project-panel-onboard")).toBeTruthy();
    });
    // Wizard owns the body.
    expect(screen.getByTestId("onboarding-wizard")).toBeTruthy();
    expect(screen.getByTestId("onboarding-wizard").getAttribute("data-embedded")).toBe("true");
    // The dialog's outer pick/confirm/init footers are gone — wizard's own
    // footer is the only one rendered.
    expect(screen.queryByTestId("add-project-footer-pick")).toBeNull();
    expect(screen.queryByTestId("add-project-footer-confirm")).toBeNull();
    expect(screen.getByTestId("onboarding-footer")).toBeTruthy();
  });

  it("wizard Cancel pops back to pick (does not close the dialog)", async () => {
    await renderDialog();
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
    await waitFor(() => expect(screen.getByTestId("add-project-panel-onboard")).toBeTruthy());

    fireEvent.click(screen.getByTestId("onboarding-cancel"));

    // Dialog is still open — we just popped back to the pick panel.
    await waitFor(() => {
      expect(screen.getByTestId("add-project-panel-pick")).toBeTruthy();
    });
    expect(screen.getByTestId("add-project-dialog")).toBeTruthy();
  });

  it("renders the directory browser on the open tab", async () => {
    await renderDialog();
    await waitFor(() => expect(screen.getByTestId("directory-browser")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-alpha")).toBeTruthy());
  });

  it("inspects when the user commits via the browser select", async () => {
    const { inspectDirectory } = await import("@/lib/api");
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
      expect(inspectDirectory).toHaveBeenCalledWith("/repos/alpha");
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

  it("renders the onboarding wizard when the picked dir has no ide.yml", async () => {
    await renderDialog();
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

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-wizard")).toBeTruthy();
    });
    expect(screen.getByTestId("onboarding-name")).toBeTruthy();
  });

  it("calls onboardProject when wizard reaches review and Create is clicked", async () => {
    const { onboardProject } = await import("@/lib/api");
    await renderDialog();
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

    // Wizard appears on Basics — step through Basics → Agents → Tools → Review.
    await screen.findByTestId("onboarding-wizard");
    fireEvent.click(screen.getByTestId("onboarding-next")); // → Agents
    fireEvent.click(screen.getByTestId("onboarding-next")); // → Tools
    fireEvent.click(screen.getByTestId("onboarding-next")); // → Review

    const submit = await screen.findByTestId("onboarding-submit");
    fireEvent.click(submit);

    await waitFor(() => {
      expect(onboardProject).toHaveBeenCalled();
    });
    const call = (onboardProject as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(call[0]).toMatchObject({
      dir: "/repos/freshproj",
      agents: 2,
    });
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
