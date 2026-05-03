export interface SkeletonProps {
  w?: string;
  h?: string;
  className?: string;
  testId?: string;
}

export function Skeleton({
  w = "w-full",
  h = "h-4",
  className = "",
  testId = "skeleton",
}: SkeletonProps) {
  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-[var(--surface)] ${w} ${h} ${className}`}
    />
  );
}

export function SkeletonText({
  lines = 3,
  testId = "skeleton-text",
}: {
  lines?: number;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="space-y-2">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} h="h-3" w={index === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}

export function SkeletonCard({ testId = "skeleton-card" }: { testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-md border border-[var(--border-weak)] bg-[var(--bg-strong)] p-3"
    >
      <Skeleton h="h-3" w="w-24" />
      <Skeleton h="h-6" w="w-16" className="mt-3" />
    </div>
  );
}
