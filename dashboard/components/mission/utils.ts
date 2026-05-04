import type { StatusPillVariant } from "@/components/ui";
import type { MilestoneData } from "@/lib/api";

export type MissionStatus = "planning" | "active" | "validating" | "complete";

export function isMissionStatus(value: string): value is MissionStatus {
  return (
    value === "planning" || value === "active" || value === "validating" || value === "complete"
  );
}

export function missionVariant(status: MissionStatus): StatusPillVariant {
  if (status === "complete") return "done";
  if (status === "validating") return "warning";
  if (status === "active") return "active";
  return "pending";
}

export function milestoneVariant(status: MilestoneData["status"]): StatusPillVariant {
  if (status === "done") return "done";
  if (status === "active") return "active";
  if (status === "validating") return "warning";
  return "pending";
}

export function percent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

const RELATIVE_THRESHOLDS: { ms: number; unit: string; div: number }[] = [
  { ms: 60_000, unit: "s", div: 1000 },
  { ms: 3_600_000, unit: "m", div: 60_000 },
  { ms: 86_400_000, unit: "h", div: 3_600_000 },
];

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  const ms = Date.now() - time;
  if (ms < 0) return "just now";
  for (const t of RELATIVE_THRESHOLDS) {
    if (ms < t.ms) return `${Math.max(0, Math.floor(ms / t.div))}${t.unit} ago`;
  }
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function parseElapsed(elapsed: string | null | undefined): number {
  if (!elapsed) return 0;
  const trimmed = elapsed.trim();
  // Forms: "12s", "5m", "1h 12m", "2d", "0"
  let total = 0;
  const re = /(\d+)\s*([smhd])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    const [, n, unit] = match;
    const value = Number(n);
    if (!Number.isFinite(value)) continue;
    if (unit === "s") total += value * 1000;
    else if (unit === "m") total += value * 60_000;
    else if (unit === "h") total += value * 3_600_000;
    else if (unit === "d") total += value * 86_400_000;
  }
  if (total === 0) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n * 1000;
  }
  return total;
}
