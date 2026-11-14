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
    "@bandcoin/map",
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

  /**
   * Murals: server-side MobileCLIP (@bandcoin/api services/ar/clip.ts) runs on
   * onnxruntime-node, a native module. It must load from node_modules at runtime
   * (it can't be bundled), and only the Linux x64 build ships to Vercel (about
   * 45 MB instead of 287 MB for every platform, which is over Vercel's function
   * size limit). Same approach as the Wadzzo AR app.
   */
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // onnxruntime loads its .so by a computed path the file tracer can't follow.
  outputFileTracingIncludes: {
    "/api/trpc/[trpc]": [
      "node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/**/onnxruntime-node/bin/napi-v6/darwin/**",
      "node_modules/**/onnxruntime-node/bin/napi-v6/win32/**",
      "node_modules/**/onnxruntime-node/bin/napi-v6/linux/arm64/**",
      "node_modules/**/onnxruntime-web/**",
    ],
  },
};

export default config;
