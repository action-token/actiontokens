import { unitTestConfig } from "@bandcoin/vitest-config";

export default unitTestConfig(import.meta.dirname, {
  env: {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    NEXT_PUBLIC_ASSET_CODE: "BANDCOIN",
    NEXT_PUBLIC_ASSET_ISSUER: "GAPWBIC6RVQZCLBQ4GTZSI3I7YRYTSBC7EJ65KHHPL4T5CJECU3PQ7PD",
    SKIP_ENV_VALIDATION: "1",
  },
});
