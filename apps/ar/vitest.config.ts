import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// `~/` is the app's own src folder, as in tsconfig, so tests can render components that use it.
export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
});
