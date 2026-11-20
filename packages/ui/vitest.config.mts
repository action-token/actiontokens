import { unitTestConfig } from "@actiontokens/vitest-config";

// Components are rendered to markup, so their tests are .tsx.
export default unitTestConfig(import.meta.dirname, { include: ["src/**/*.test.{ts,tsx}"] });
