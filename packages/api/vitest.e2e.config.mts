import { config } from "dotenv";
import { mergeConfig } from "vitest/config";

import { e2eTestConfig } from "@actiontokens/vitest-config";

// DATABASE_URL for the Bandcoin dev database; the test refuses any other host.
config({ path: new URL("../db/.env", import.meta.url).pathname, quiet: true });

/** Runs against the dev database with a fake chain: no testnet calls, no card charges. */
export default mergeConfig(e2eTestConfig(import.meta.dirname), {
  test: {
    env: {
      NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
      NEXT_PUBLIC_ASSET_CODE: "BANDCOIN",
      NEXT_PUBLIC_ASSET_ISSUER: "GAPWBIC6RVQZCLBQ4GTZSI3I7YRYTSBC7EJ65KHHPL4T5CJECU3PQ7PD",
      SKIP_ENV_VALIDATION: "1",
    },
  },
});
