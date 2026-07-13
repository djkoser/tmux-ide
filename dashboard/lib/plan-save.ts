export type SaveDecision =
  | { save: true; content: string }
  | { save: false; reason: "not-ready" | "serialize-error" };

/**
 * Decide what to persist for a plan save.
 *
 * The live editor markdown is the only acceptable source. If serialization
 * failed (`serializeFailed`) or the editor is not mounted (`live === null`),
 * the save is BLOCKED and the caller must surface an error — never silently
 * fall back to a pre-edit snapshot, which would drop the user's edits without
 * warning. An empty string is a valid live document (the user cleared it) and
 * is persisted as-is.
 */
export function decideSaveContent(live: string | null, serializeFailed: boolean): SaveDecision {
  if (serializeFailed) return { save: false, reason: "serialize-error" };
  if (live === null) return { save: false, reason: "not-ready" };
  return { save: true, content: live };
}
