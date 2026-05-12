import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@components": path.resolve(__dirname, "./components/tui"),
      "@tmux-ide/ws-v3-protocol": path.resolve(__dirname, "../src/lib/ws-v3/protocol.ts"),
      // V2ChatView dynamically imports the Solid island; under test we
      // resolve it to a stub so vite-import-analysis doesn't fail.
      "@tmux-ide/chat-solid": path.resolve(__dirname, "./__mocks__/chat-solid.ts"),
    },
  },
});
