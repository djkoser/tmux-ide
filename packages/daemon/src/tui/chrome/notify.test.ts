/**
 * Unit tests for the pure parts of the notification loop — the decision engine
 * (blocked/done filtering, viewer suppression, debounce), the message formats,
 * the client parser, and the prefs resolution + kill-switch.
 */
import { describe, expect, it } from "vitest";
import {
  applyKillSwitch,
  decideNotifications,
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFY_DEBOUNCE_MS,
  notificationPrefs,
  parseClients,
  type AttachedClient,
  type NotifyEvent,
} from "./notify.ts";

function ev(
  session: string,
  to: NotifyEvent["to"],
  from: NotifyEvent["from"] = "working",
): NotifyEvent {
  return { session, from, to };
}

describe("decideNotifications", () => {
  it("notifies only on blocked / done — working and idle are ignored", () => {
    const events = [
      ev("a", "blocked"),
      ev("b", "done"),
      ev("c", "working"),
      ev("d", "idle"),
      ev("e", "unknown"),
    ];
    const { toasts, system } = decideNotifications(events, [], new Map(), 0);
    // No clients → no toasts, but a system entry per qualifying event.
    expect(toasts).toEqual([]);
    expect(system).toEqual([
      { message: "⚠ a needs you (blocked)" },
      { message: "✓ b finished (done)" },
    ]);
  });

  it("uses the ⚠ / ✓ message formats", () => {
    const clients: AttachedClient[] = [{ client: "/dev/ttys001", session: "other" }];
    const { toasts } = decideNotifications(
      [ev("web", "blocked"), ev("api", "done")],
      clients,
      new Map(),
      0,
    );
    expect(toasts.map((t) => t.message)).toEqual([
      "⚠ web needs you (blocked)",
      "✓ api finished (done)",
    ]);
  });

  it("toasts every client EXCEPT the one viewing that session", () => {
    const clients: AttachedClient[] = [
      { client: "viewer", session: "web" }, // watching web — suppressed
      { client: "other", session: "api" }, // watching api — still toasted
    ];
    const { toasts, system } = decideNotifications([ev("web", "blocked")], clients, new Map(), 0);
    expect(toasts).toEqual([{ client: "other", message: "⚠ web needs you (blocked)" }]);
    // The system (macOS) entry is still produced regardless of viewers.
    expect(system).toEqual([{ message: "⚠ web needs you (blocked)" }]);
  });

  it("suppresses toasts entirely when the only client is viewing the session, but keeps the system entry", () => {
    const clients: AttachedClient[] = [{ client: "viewer", session: "web" }];
    const { toasts, system } = decideNotifications([ev("web", "blocked")], clients, new Map(), 0);
    expect(toasts).toEqual([]);
    expect(system).toEqual([{ message: "⚠ web needs you (blocked)" }]);
  });

  it("debounces the same session+state within the window and allows it after", () => {
    const clients: AttachedClient[] = [{ client: "c1", session: "other" }];
    const first = decideNotifications([ev("web", "blocked")], clients, new Map(), 1000);
    expect(first.toasts).toHaveLength(1);
    expect(first.nextLastNotified.get("web:blocked")).toBe(1000);

    // 20s later — still within the 30s window → skipped, map unchanged.
    const within = decideNotifications(
      [ev("web", "blocked")],
      clients,
      first.nextLastNotified,
      1000 + 20_000,
    );
    expect(within.toasts).toEqual([]);
    expect(within.system).toEqual([]);
    expect(within.nextLastNotified.get("web:blocked")).toBe(1000);

    // Past the window → fires again and records the new timestamp.
    const after = decideNotifications(
      [ev("web", "blocked")],
      clients,
      within.nextLastNotified,
      1000 + NOTIFY_DEBOUNCE_MS + 1,
    );
    expect(after.toasts).toHaveLength(1);
    expect(after.nextLastNotified.get("web:blocked")).toBe(1000 + NOTIFY_DEBOUNCE_MS + 1);
  });

  it("debounces per session+state, so blocked then done for the same session both fire", () => {
    const clients: AttachedClient[] = [{ client: "c1", session: "other" }];
    const blocked = decideNotifications([ev("web", "blocked")], clients, new Map(), 0);
    const done = decideNotifications([ev("web", "done")], clients, blocked.nextLastNotified, 5000);
    expect(done.toasts).toEqual([{ client: "c1", message: "✓ web finished (done)" }]);
    expect(done.nextLastNotified.get("web:blocked")).toBe(0);
    expect(done.nextLastNotified.get("web:done")).toBe(5000);
  });

  it("does not mutate the passed-in lastNotified map", () => {
    const clients: AttachedClient[] = [{ client: "c1", session: "other" }];
    const lastNotified = new Map<string, number>();
    decideNotifications([ev("web", "blocked")], clients, lastNotified, 0);
    expect(lastNotified.size).toBe(0);
  });
});

describe("parseClients", () => {
  it("parses client\\tsession lines and drops malformed ones", () => {
    expect(
      parseClients(["/dev/ttys000\tweb", "/dev/ttys001\tapi", "", "lonely", "\tdangling"]),
    ).toEqual([
      { client: "/dev/ttys000", session: "web" },
      { client: "/dev/ttys001", session: "api" },
    ]);
  });
});

describe("notificationPrefs", () => {
  it("defaults toast=true, macos=false for missing / invalid config", () => {
    expect(notificationPrefs(undefined)).toEqual({ toast: true, macos: false });
    expect(notificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(notificationPrefs("nonsense")).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(notificationPrefs({})).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(notificationPrefs({ notifications: {} })).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("reads explicit booleans and ignores non-booleans", () => {
    expect(notificationPrefs({ notifications: { toast: false, macos: true } })).toEqual({
      toast: false,
      macos: true,
    });
    expect(notificationPrefs({ notifications: { toast: "yes", macos: 1 } })).toEqual(
      DEFAULT_NOTIFICATION_PREFS,
    );
  });
});

describe("applyKillSwitch", () => {
  it("TMUX_IDE_NOTIFY=0 disables both channels", () => {
    expect(applyKillSwitch({ toast: true, macos: true }, "0")).toEqual({
      toast: false,
      macos: false,
    });
  });

  it("leaves prefs untouched otherwise", () => {
    const prefs = { toast: true, macos: false };
    expect(applyKillSwitch(prefs, undefined)).toEqual(prefs);
    expect(applyKillSwitch(prefs, "1")).toEqual(prefs);
    expect(applyKillSwitch(prefs, "")).toEqual(prefs);
  });
});
