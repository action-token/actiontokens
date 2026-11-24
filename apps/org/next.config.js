/** @type {import("next").NextConfig} */
const config = {
  // dev only: the portal is also opened at 127.0.0.1 (a second origin, so signed out)
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    // Bundled, not loaded as externals: firebase-admin -> jwks-rsa -> jose is ES-module only,
    // and an external require() of it fails at runtime on Vercel ("ERR_REQUIRE_ESM", HTTP 500).
    // Same fix as the Wadzzo apps.
    "firebase-admin",
    "jwks-rsa",
    "jose",
    "@actiontokens/api",
    "@actiontokens/ar-core",
    "@actiontokens/map",
    "@actiontokens/auth",
    "@actiontokens/chain",
    "@actiontokens/db",
    "@actiontokens/errors",
    "@actiontokens/page",
    "@actiontokens/geo",
    "@actiontokens/storage",
    "@actiontokens/ui",
    "@actiontokens/utils",
    "@actiontokens/wallet",
  ],
  reactStrictMode: true,
};

export default config;
