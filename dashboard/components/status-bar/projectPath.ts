"use client";

export function projectNameFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}
