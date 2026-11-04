import { unitTestConfig } from "@bandcoin/vitest-config";

export default unitTestConfig(import.meta.dirname, {
  include: ["scripts/**/*.test.ts"],
});
