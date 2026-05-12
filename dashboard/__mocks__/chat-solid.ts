export function mount(): { unmount(): void; setThreadId(id: string): void } {
  return {
    unmount: () => undefined,
    setThreadId: () => undefined,
  };
}
