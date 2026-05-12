import { beforeEach } from "vitest";

function installStorageShim(): void {
  if (typeof window === "undefined") return;
  if (typeof window.localStorage?.getItem === "function") return;

  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return data.size;
      },
      key: (index: number) => Array.from(data.keys())[index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, String(value));
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => {
        data.clear();
      },
    },
  });
}

installStorageShim();

beforeEach(() => {
  installStorageShim();
});
