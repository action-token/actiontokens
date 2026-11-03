/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: [
    // Bundled, not loaded as externals: firebase-admin -> jwks-rsa -> jose is ES-module only
    // (same fix as the artist portal).
    "firebase-admin",
    "jwks-rsa",
    "jose",
    "@bandcoin/api",
    "@bandcoin/auth",
    "@bandcoin/chain",
    "@bandcoin/db",
    "@bandcoin/errors",
    "@bandcoin/storage",
    "@bandcoin/ui",
    "@bandcoin/utils",
    "@bandcoin/wallet",
  ],
  reactStrictMode: true,
};

export default config;
