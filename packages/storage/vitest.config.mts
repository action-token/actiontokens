import { unitTestConfig } from "@actiontokens/vitest-config";

export default unitTestConfig(import.meta.dirname, {
  env: {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    AWS_BUCKET_NAME: "test-bucket",
    AWS_BUCKET_REGION: "us-east-1",
    AWS_ACCESS_KEY: "test-key",
    AWS_SECRET_ACCESS_KEY: "test-secret",
  },
});
