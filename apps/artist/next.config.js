/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: [
    "@bandcoin/api",
    "@bandcoin/ar-core",
    "@bandcoin/auth",
    "@bandcoin/chain",
    "@bandcoin/db",
    "@bandcoin/errors",
    "@bandcoin/geo",
    "@bandcoin/storage",
    "@bandcoin/ui",
    "@bandcoin/utils",
    "@bandcoin/wallet",
  ],
  reactStrictMode: true,
};

export default config;
