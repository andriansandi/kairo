import { defineConfig } from "vitest/config";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname ?? ".", "../..");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@kairo\/(.*)$/,
        replacement: path.join(workspaceRoot, "packages", "$1", "src", "index.ts"),
      },
    ],
  },
  test: {
    server: {
      deps: {
        inline: [/@kairo\//],
      },
    },
  },
});
