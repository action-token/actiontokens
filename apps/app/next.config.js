/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: ["@bandcoin/api", "@bandcoin/auth", "@bandcoin/chain", "@bandcoin/db", "@bandcoin/errors", "@bandcoin/ui", "@bandcoin/utils", "@bandcoin/wallet"],
  reactStrictMode: true,
};

export default config;
