/**
 * Old bandfan addresses that now live somewhere else: pages that moved inside
 * this app, the artist portal's pages (they were under /artist and /admin on
 * the old site), and the in-app map (it was under /action). Links to a single
 * artist, item, NFT or album need a database lookup, so they go through
 * /api/legacy/<kind>/<id>. Temporary redirects for now: make them permanent
 * once the checklist is done.
 */
const STELLAR_KEY = "G[A-Z2-7]{55}";

/** @param {{ portal: string, ar: string }} origins */
export function legacyRedirects({ portal, ar }) {
  /** @param {string} source @param {string} destination */
  const to = (source, destination) => ({ source, destination, permanent: false });
  return [
    // One thing, looked up by its old id.
    to(`/artist/:id(${STELLAR_KEY})`, "/api/legacy/artist/:id"),
    to("/asset/:id(\\d+)", "/api/legacy/asset/:id"),
    to("/market-asset/:id(\\d+)", "/api/legacy/market-asset/:id"),
    to("/nft/manage/:id", "/api/legacy/nft/:id"),
    to("/nft/:id", "/api/legacy/nft/:id"),
    to("/smart-contract/manage/:id", "/api/legacy/nft/:id"),
    to("/smart-contract/:id", "/api/legacy/nft/:id"),
    to("/music/album/:id(\\d+)", "/api/legacy/album/:id"),

    // Pages that moved inside this app.
    to("/nft", "/marketplace"),
    to("/smart-contract", "/marketplace"),
    to("/my-collection", "/collection"),
    to("/collections", "/collection"),
    to("/creator-feed", "/feed"),
    to("/notification", "/notifications"),
    to("/wallet-balance", "/wallet"),
    to("/bounty", "/bounties"),
    to("/recharge/:path+", "/recharge"),
    to("/pins", `${ar}/collection`),

    // The artist portal.
    to("/artist/create", `${portal}/`),
    to("/artist/profile/edit", `${portal}/settings`),
    to("/artist/profile", `${portal}/settings`),
    to("/artist/settings", `${portal}/settings`),
    to("/artist/store/:path*", `${portal}/wallet`),
    to("/artist/classic-nft/create", `${portal}/items/new`),
    to("/artist/non-stellar-item/create", `${portal}/items/new`),
    to("/artist/sell-page-asset/create", `${portal}/items/new`),
    to("/artist/smart-contract/create", `${portal}/items/new`),
    to("/artist/smart-contract/edit/:id", `${portal}/items/:id`),
    to("/artist/music/create", `${portal}/music/new`),
    to("/artist/music/album/:path*", `${portal}/music/albums`),
    to("/artist/music", `${portal}/music`),
    to("/artist/post/new", `${portal}/posts/new`),
    to("/artist/post/:path*", `${portal}/posts`),
    to("/artist/bounty/create", `${portal}/bounties/new`),
    to("/artist/bounty/edit/:id", `${portal}/bounties/:id/edit`),
    to("/artist/bounty", `${portal}/bounties`),
    to("/artist/memberships/:path*", `${portal}/memberships`),
    to("/artist/domain/:path*", `${portal}/domain`),
    to("/artist/gift/:path*", `${portal}/gifts`),
    to("/artist/redeem/:path*", `${portal}/redeem`),
    to("/artist/map/collection-report/:path*", `${portal}/reports`),
    to("/artist/map/:path*", `${portal}/pins`),
    to("/admin/creators", `${portal}/admin/artists`),
    to("/admin/map", `${portal}/admin/pins/map`),
    to("/admin/bounty", `${portal}/admin/bounties`),
    to("/admin/collection-report/:path*", `${portal}/admin/reports`),
    to("/admin/market-assets", `${portal}/admin/items`),
    to("/admin/wallet", `${portal}/admin/users`),
    to("/admin/ai", `${portal}/admin/settings`),
    to("/admin/:path*", `${portal}/admin/:path*`),

    // The in-app map.
    to("/action/actions/:id", `${ar}/bounty/:id`),
    to("/action/actions", `${ar}/bounty`),
    to("/action/artists", `${ar}/artists`),
    to("/action/collections/post/:id", `${ar}/collection`),
    to("/action/collections/:path*", `${ar}/collection`),
    to("/action/profile", `${ar}/profile`),
    to("/action/qr/:path*", `${ar}/scan`),
    to("/action/:path*", `${ar}/ar`),
  ];
}
