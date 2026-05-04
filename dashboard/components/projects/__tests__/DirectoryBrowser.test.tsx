import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOME = "/Users/test";

const HOME_RESULT = {
  path: HOME,
  parentPath: "/Users",
  entries: [
    { name: "Developer", fullPath: `${HOME}/Developer`, isDir: true, isSymlink: false },
    { name: "Documents", fullPath: `${HOME}/Documents`, isDir: true, isSymlink: false },
    { name: "README.md", fullPath: `${HOME}/README.md`, isDir: false, isSymlink: false },
  ],
};

const DEVELOPER_RESULT = {
  path: `${HOME}/Developer`,
  parentPath: HOME,
  entries: [
    {
      name: "tmux-ide",
      fullPath: `${HOME}/Developer/tmux-ide`,
      isDir: true,
      isSymlink: false,
    },
  ],
};

vi.mock("@/lib/api", () => ({
  fetchFilesystem: vi.fn(),
}));

const mocks = await import("@/lib/api");
const fetchFilesystemMock = vi.mocked(mocks.fetchFilesystem);

beforeEach(() => {
  fetchFilesystemMock.mockReset();
  fetchFilesystemMock.mockImplementation(async (path?: string, showHidden?: boolean) => {
    if (path === `${HOME}/Developer`) return DEVELOPER_RESULT;
    if (path === "/Users") {
      return {
        path: "/Users",
        parentPath: null,
        entries: [{ name: "test", fullPath: HOME, isDir: true, isSymlink: false }],
      };
    }
    // home or empty (defaults to home).
    if (showHidden) {
      return {
        path: HOME,
        parentPath: "/Users",
        entries: [
          ...HOME_RESULT.entries,
          { name: ".env", fullPath: `${HOME}/.env`, isDir: false, isSymlink: false },
        ],
      };
    }
    return HOME_RESULT;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

import { DirectoryBrowser } from "../DirectoryBrowser";

function setup(overrides: Partial<React.ComponentProps<typeof DirectoryBrowser>> = {}) {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  const utils = render(
    <DirectoryBrowser value={HOME} onChange={onChange} onSelect={onSelect} {...overrides} />,
  );
  return { onChange, onSelect, ...utils };
}

describe("DirectoryBrowser", () => {
  it("renders entries from the server-driven listing", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByTestId("directory-browser-entry-Developer")).toBeTruthy();
    });
    expect(screen.getByTestId("directory-browser-entry-Documents")).toBeTruthy();
    expect(screen.getByTestId("directory-browser-entry-README.md")).toBeTruthy();
  });

  it("navigates into a folder when clicked", async () => {
    const { onChange } = setup();
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-Developer")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("directory-browser-entry-Developer"));
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-tmux-ide")).toBeTruthy(),
    );
    expect(onChange).toHaveBeenCalledWith(`${HOME}/Developer`);
  });

  it("commits via the Use this folder button", async () => {
    const { onSelect } = setup();
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-Developer")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("directory-browser-select"));
    expect(onSelect).toHaveBeenCalledWith(HOME);
  });

  it("navigates up via the back button when parentPath is set", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-Developer")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("directory-browser-back"));
    await waitFor(() => expect(screen.getByTestId("directory-browser-entry-test")).toBeTruthy());
  });

  it("toggles hidden files", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-Developer")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("directory-browser-hidden-toggle"));
    await waitFor(() => {
      expect(screen.queryByTestId("directory-browser-entry-.env")).toBeTruthy();
    });
  });

  it("supports keyboard navigation", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-Developer")).toBeTruthy(),
    );
    const root = screen.getByTestId("directory-browser");
    // First entry selected by default; ArrowDown should select Documents.
    fireEvent.keyDown(root, { key: "ArrowDown" });
    await waitFor(() => {
      const documents = screen.getByTestId("directory-browser-entry-Documents");
      expect(documents.getAttribute("data-selected")).toBe("true");
    });
  });

  it("commits on cmd+enter", async () => {
    const { onSelect } = setup();
    await waitFor(() =>
      expect(screen.getByTestId("directory-browser-entry-Developer")).toBeTruthy(),
    );
    const root = screen.getByTestId("directory-browser");
    fireEvent.keyDown(root, { key: "Enter", metaKey: true });
    expect(onSelect).toHaveBeenCalledWith(HOME);
  });

  it("renders an error message when the server rejects the path", async () => {
    fetchFilesystemMock.mockRejectedValueOnce(new Error("outside-sandbox"));
    setup({ value: "/etc" });
    await waitFor(() => expect(screen.getByTestId("directory-browser-error")).toBeTruthy());
    expect(screen.getByTestId("directory-browser-error").textContent).toContain("outside-sandbox");
  });
});
