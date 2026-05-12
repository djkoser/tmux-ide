/**
 * V2 action client — single source of truth for invoking typed actions
 * against the command-center daemon. Every dispatch hits
 * `POST /api/v2/action/:name` with the input payload as JSON body.
 *
 * The server response envelope is:
 *   { ok: true, result }
 *   { ok: false, error: { code, message, details? } }
 *
 * Successful envelopes return the typed `result`. Failures throw an
 * `ActionInvocationError` carrying the typed `code`/`message` so call
 * sites can branch on `error.code` (never string-match the message).
 *
 * This module imports the action contract from
 * `src/command-center/actions/contract.ts` (Agent 1 owned) so input /
 * result shapes stay in lockstep with the server. If the contract has
 * not landed yet the import would fail at type-check time — keeping
 * the wire format honest.
 */
import { API_BASE } from "./api";
import { authHeaders } from "./appProtocol";
import type { ActionInput, ActionName, ActionResult, ActionErrorCode } from "@tmux-ide/contracts";

export type { ActionErrorCode, ActionName, ActionInput, ActionResult } from "@tmux-ide/contracts";

/**
 * Typed error thrown when the server returns `{ ok: false, error }`.
 * The `code` field is part of the contract and stable across
 * versions; consumers branch on it to choose user-facing messages.
 */
export class ActionInvocationError<Code extends ActionErrorCode = ActionErrorCode> extends Error {
  readonly code: Code;
  readonly action: ActionName;
  readonly details: unknown;

  constructor(args: { action: ActionName; code: Code; message: string; details?: unknown }) {
    super(args.message);
    this.name = "ActionInvocationError";
    this.code = args.code;
    this.action = args.action;
    this.details = args.details ?? null;
  }
}

interface SuccessEnvelope<T> {
  readonly ok: true;
  readonly result: T;
}

interface FailureEnvelope {
  readonly ok: false;
  readonly error: { code: ActionErrorCode; message: string; details?: unknown };
}

type Envelope<T> = SuccessEnvelope<T> | FailureEnvelope;

function isFailureEnvelope<T>(value: Envelope<T>): value is FailureEnvelope {
  return value.ok === false;
}

/**
 * Cheap structural check used to distinguish a typed-error JSON body
 * (which we want to surface verbatim, even when wrapped in a 4xx) from
 * a non-envelope payload (where we substitute a friendlier message).
 */
function isParsableEnvelope(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("ok" in value)) return false;
  const v = value as { ok: unknown; result?: unknown; error?: unknown };
  if (v.ok === true) return "result" in v;
  if (v.ok === false) return v.error !== null && typeof v.error === "object";
  return false;
}

function envelopeFromUnknown(value: unknown, action: ActionName): Envelope<unknown> {
  if (value && typeof value === "object" && "ok" in value) {
    const envelope = value as { ok: unknown };
    if (envelope.ok === true && "result" in envelope) {
      return { ok: true, result: (envelope as { result: unknown }).result };
    }
    if (envelope.ok === false && "error" in envelope) {
      const errorPart = (envelope as { error: unknown }).error;
      if (
        errorPart &&
        typeof errorPart === "object" &&
        "code" in errorPart &&
        "message" in errorPart
      ) {
        const e = errorPart as { code: unknown; message: unknown; details?: unknown };
        return {
          ok: false,
          error: {
            code: String(e.code) as ActionErrorCode,
            message: String(e.message),
            details: e.details,
          },
        };
      }
    }
  }
  // Server returned a body that doesn't match the envelope contract — this
  // is a server bug and we surface it as a typed error so the dashboard
  // doesn't silently fall through.
  return {
    ok: false,
    error: {
      code: "internal" as ActionErrorCode,
      message: `Action "${action}" returned a malformed response envelope`,
      details: value,
    },
  };
}

/**
 * Invoke a V2 action by name with its typed input. Returns the typed
 * result on success; throws `ActionInvocationError` on `{ ok: false }`
 * envelopes; rethrows native fetch errors verbatim (network down, CORS,
 * etc.) so callers can decide how to surface them.
 */
export async function dispatch<Name extends ActionName>(
  name: Name,
  input: ActionInput<Name>,
): Promise<ActionResult<Name>> {
  const res = await fetch(`${API_BASE}/api/v2/action/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  // Try to parse the body as a typed envelope FIRST — the server may use
  // HTTP 4xx with a typed error body, which we still want to surface as
  // a typed `ActionInvocationError`. Only short-circuit non-JSON or
  // empty 404 responses (the canonical "daemon predates V2" signal).
  if (res.status === 404 && (body === null || !isParsableEnvelope(body))) {
    throw new ActionInvocationError({
      action: name,
      code: "internal" as ActionErrorCode,
      message: `Action endpoint not found at ${API_BASE}. The daemon may be outdated — restart it (\`tmux-ide stop && tmux-ide\`).`,
      details: { status: 404, action: name },
    });
  }

  // Other non-2xx responses with non-JSON bodies (HTML error pages, gateway
  // errors, etc.) get surfaced with their HTTP status rather than as a
  // misleading "malformed envelope".
  if (!res.ok && body === null) {
    throw new ActionInvocationError({
      action: name,
      code: "internal" as ActionErrorCode,
      message: `Action "${name}" failed: HTTP ${res.status} ${res.statusText || ""}`.trim(),
      details: { status: res.status, action: name },
    });
  }

  const envelope = envelopeFromUnknown(body, name);
  if (isFailureEnvelope(envelope)) {
    throw new ActionInvocationError({
      action: name,
      code: envelope.error.code,
      message: envelope.error.message,
      details: envelope.error.details,
    });
  }

  // The success branch is structurally checked above. Trust the contract:
  // if the server says ok=true with a result field, that result has the
  // shape declared in contract.ts.
  return envelope.result as ActionResult<Name>;
}
