/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: [
    // Bundled, not loaded as externals: firebase-admin -> jwks-rsa -> jose is ES-module only,
    // and an external require() of it fails at runtime on Vercel ("ERR_REQUIRE_ESM", HTTP 500).
    // Same fix as the Wadzzo apps.
    "firebase-admin",
    "jwks-rsa",
    "jose",
    "@actiontokens/api",
    "@actiontokens/auth",
    "@actiontokens/chain",
    "@actiontokens/db",
    "@actiontokens/errors",
    "@actiontokens/page",
    "@actiontokens/storage",
    "@actiontokens/ui",
    "@actiontokens/utils",
    "@actiontokens/wallet",
  ],
  reactStrictMode: true,

  // SEP-1: wallets look for the file under .well-known (a folder the type checker skips, so the route lives apart).
  rewrites() {
    return Promise.resolve([{ source: "/.well-known/stellar.toml", destination: "/stellar-toml" }]);
  },

  // The page builder's preview may only be framed by the artist portal.
  async headers() {
    const portal = new URL(process.env.NEXT_PUBLIC_ARTIST_URL ?? "https://artist.bandcoin.io")
      .origin;
    const frameAncestors =
      process.env.NODE_ENV === "production"
        ? `'self' ${portal}`
        : `'self' ${portal} http://localhost:3001`;
    return [
      {
        source: "/artist/:slug/preview",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` }],
      },
    ];
  },
};

export default config;
