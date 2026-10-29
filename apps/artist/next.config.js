/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: [
    // Bundled, not loaded as externals: firebase-admin -> jwks-rsa -> jose is ES-module only,
    // and an external require() of it fails at runtime on Vercel ("ERR_REQUIRE_ESM", HTTP 500).
    // Same fix as the Wadzzo apps.
    "firebase-admin",
    "jwks-rsa",
    "jose",
    "@bandcoin/api",
    "@bandcoin/ar-core",
    "@bandcoin/auth",
    "@bandcoin/chain",
    "@bandcoin/db",
    "@bandcoin/errors",
    "@bandcoin/page",
    "@bandcoin/geo",
    "@bandcoin/storage",
    "@bandcoin/ui",
    "@bandcoin/utils",
    "@bandcoin/wallet",
  ],
  reactStrictMode: true,
};

export default config;
