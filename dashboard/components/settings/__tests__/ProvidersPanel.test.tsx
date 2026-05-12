import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProvidersPanel } from "../ProvidersPanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("ProvidersPanel", () => {
  it("renders the empty state when no providers exist", () => {
    render(<ProvidersPanel />);
    expect(screen.getByTestId("providers-empty")).toBeTruthy();
  });

  it("adds a valid anthropic provider and clears the draft", () => {
    render(<ProvidersPanel />);
    fireEvent.change(screen.getByTestId("providers-draft-id"), {
      target: { value: "ant-prod" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-name"), {
      target: { value: "Prod Claude" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-model"), {
      target: { value: "claude-opus-4-7" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-apikey"), {
      target: { value: "sk-abc" },
    });
    fireEvent.click(screen.getByTestId("providers-draft-add"));

    const rows = screen.getAllByTestId("providers-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("Prod Claude")).toBeTruthy();

    // Draft input cleared
    expect((screen.getByTestId("providers-draft-id") as HTMLInputElement).value).toBe("");
  });

  it("disables Add for invalid drafts (no apiKey on anthropic)", () => {
    render(<ProvidersPanel />);
    fireEvent.change(screen.getByTestId("providers-draft-id"), {
      target: { value: "ant" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-name"), {
      target: { value: "no key" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-model"), {
      target: { value: "claude" },
    });
    expect((screen.getByTestId("providers-draft-add") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("hides apiKey field for local-ollama and accepts only model + base url", () => {
    render(<ProvidersPanel />);
    fireEvent.change(screen.getByTestId("providers-draft-kind"), {
      target: { value: "local-ollama" },
    });
    expect(screen.queryByTestId("providers-draft-apikey")).toBeNull();

    fireEvent.change(screen.getByTestId("providers-draft-id"), {
      target: { value: "olla" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-name"), {
      target: { value: "Local Ollama" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-model"), {
      target: { value: "llama3" },
    });
    fireEvent.click(screen.getByTestId("providers-draft-add"));
    expect(screen.getAllByTestId("providers-row")).toHaveLength(1);
  });

  it("removes a provider and persists the deletion to localStorage", () => {
    render(<ProvidersPanel initialProviders={[
      {
        id: "ant",
        kind: "anthropic",
        displayName: "Claude",
        model: "claude-opus-4-7",
        apiKey: "sk-x",
      },
    ]} />);
    fireEvent.click(screen.getByTestId("providers-remove"));
    expect(screen.getByTestId("providers-empty")).toBeTruthy();
    const stored = window.localStorage.getItem("tmux-ide.providers.v1");
    expect(stored).toBe("[]");
  });

  it("rejects duplicate ids on add (silently — button does nothing)", () => {
    render(<ProvidersPanel initialProviders={[
      {
        id: "dup",
        kind: "anthropic",
        displayName: "Claude",
        model: "m",
        apiKey: "k",
      },
    ]} />);
    fireEvent.change(screen.getByTestId("providers-draft-id"), {
      target: { value: "dup" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-name"), {
      target: { value: "Other" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-model"), {
      target: { value: "m2" },
    });
    fireEvent.change(screen.getByTestId("providers-draft-apikey"), {
      target: { value: "k2" },
    });
    fireEvent.click(screen.getByTestId("providers-draft-add"));
    expect(screen.getAllByTestId("providers-row")).toHaveLength(1);
  });
});
