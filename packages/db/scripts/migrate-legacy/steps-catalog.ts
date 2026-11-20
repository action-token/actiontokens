import type { Copier, Row } from "./copier";
import {
  dec,
  itemType,
  listingStatus,
  mediaType,
  mimeMedia,
  orderCurrency,
  orderStatus,
  uniqueSlug,
  visibility,
} from "./map";
import { chainAccount } from "./steps-people";

const COVER_FALLBACK = "";

/** Fan tokens: one item and classic token per artist, plus externally issued ones. */
export async function copyFanTokens(copy: Copier) {
  const now = new Date();
  const creators = await copy.read("Creator");
  const byId = new Map(creators.map((c) => [c.id as string, c]));
  const add = async (
    creator: Row,
    token: {
      code: string;
      issuer: string;
      cover: string;
      supply: number | null;
      external: boolean;
    },
  ) => {
    const organizationId = copy.must("Creator", creator.id);
    const itemId = copy.map("FanToken", creator.id);
    const issuerAccountId = token.external
      ? null
      : ((
          await copy.target.query(`SELECT "issuerAccountId" id FROM organizations WHERE id = $1`, [
            organizationId,
          ])
        ).rows[0]?.id ?? null);
    await copy.insert("items", [
      {
        id: itemId,
        type: "FAN_TOKEN",
        chainType: "CLASSIC_TOKEN",
        title: token.code,
        slug: uniqueSlug(copy.slug("item"), `${creator.name ?? ""} ${token.code}`),
        coverUrl: token.cover,
        supply: token.supply,
        organizationId,
        createdById: copy.must("User", creator.id),
        createdAt: creator.createdAt,
        updatedAt: now,
      },
    ]);
    await copy.insert("classic_tokens", [
      {
        itemId,
        code: token.code,
        issuer: token.issuer,
        issuerAccountId,
        isExternal: token.external || !issuerAccountId,
      },
    ]);
    await copy.target.query(`UPDATE organizations SET "fanTokenItemId" = $1 WHERE id = $2`, [
      itemId,
      organizationId,
    ]);
  };

  for (const token of await copy.read("CreatorPageAsset")) {
    const creator = byId.get(token.creatorId);
    if (!creator) throw new Error(`Fan token of unknown artist ${token.creatorId}`);
    await add(creator, {
      code: token.code,
      issuer: token.issuer,
      cover: token.thumbnail ?? creator.profileUrl ?? COVER_FALLBACK,
      supply: token.limit,
      external: !token.issuerPrivate,
    });
  }
  for (const creator of creators) {
    if (!creator.customPageAssetCodeIssuer || copy.find("FanToken", creator.id)) continue;
    const [code, issuer] = String(creator.customPageAssetCodeIssuer).split("-");
    if (!code || !issuer) {
      copy.skip("Creator.customPageAsset", creator.id, "external token isn't CODE-ISSUER");
      continue;
    }
    await add(creator, {
      code,
      issuer,
      cover: creator.profileUrl ?? COVER_FALLBACK,
      supply: null,
      external: true,
    });
  }
}

export async function copyAssets(copy: Copier) {
  const creators = new Map((await copy.read("Creator")).map((c) => [c.id as string, c]));
  const admins = await copy.read(`SELECT id FROM "Admin" ORDER BY "joinedAt" LIMIT 1`);
  for (const asset of await copy.read(`SELECT * FROM "Asset" ORDER BY id`)) {
    const itemId = copy.map("Asset", asset.id);
    const creator = asset.creatorId ? creators.get(asset.creatorId) : null;
    const type = itemType(asset.mediaType);
    const onChain = asset.kind === "STELLAR_CLASSIC";
    const createdById = copy.must("User", asset.creatorId ?? admins[0]?.id);
    await copy.insert("items", [
      {
        id: itemId,
        type,
        chainType: onChain ? "CLASSIC_TOKEN" : "OFF_CHAIN",
        title: asset.name,
        slug: uniqueSlug(copy.slug("item"), asset.slug ?? asset.name),
        description: asset.description,
        coverUrl: asset.thumbnail || COVER_FALLBACK,
        accentColor: asset.accentColor,
        visibility: visibility(asset.privacy),
        tierId: copy.find("Subscription", asset.tierId),
        supply: asset.limit,
        royaltyPercent: asset.percentage === null ? null : Number(asset.percentage).toFixed(4),
        releaseAt: asset.releaseDate,
        saleEndsAt: asset.fundEndDate,
        playCount: asset.playCount,
        organizationId: copy.find("Creator", asset.creatorId),
        createdById,
        deletedAt: asset.deletedAt,
        createdAt: asset.createdAt,
        updatedAt: new Date(),
      },
    ]);
    await copy.insert("item_media", [
      {
        itemId,
        mediaType: mediaType(asset.mediaType),
        sourceUrl: asset.mediaUrl,
        demoUrl: asset.demoMediaUrl,
        status: asset.mediaStatus,
        streamKey: asset.streamKey,
        previewKey: asset.previewKey,
        waveformKey: asset.waveformKey,
        previewStartSec: asset.previewStartSec,
        durationSec: asset.duration,
      },
    ]);
    if (type === "TRACK")
      await copy.insert("tracks", [{ itemId, artistName: creator?.name ?? "Unknown artist" }]);
    if (onChain) {
      const issuerAccountId = asset.issuerPrivate
        ? await chainAccount(copy, {
            kind: "ISSUER",
            publicKey: asset.issuer,
            secret: asset.issuerPrivate,
            ownerId: createdById,
            createdAt: asset.createdAt,
            ref: String(asset.id),
            table: "Asset.issuerKey",
          })
        : null;
      await copy.insert("classic_tokens", [
        {
          itemId,
          code: asset.code,
          issuer: asset.issuer,
          issuerAccountId,
          isExternal: !issuerAccountId,
        },
      ]);
    }
  }
  await copy.insert(
    "albums",
    (await copy.read("Album")).map((album: Row) => ({
      id: copy.map("Album", album.id),
      organizationId: copy.find("Creator", album.creatorId),
      title: album.name,
      slug: uniqueSlug(copy.slug("album"), album.slug ?? album.name),
      description: album.description,
      coverUrl: album.coverImgUrl,
      createdAt: album.createdAt,
    })),
  );
  await copy.insert(
    "ownerships",
    (await copy.read("User_Asset")).map((owned: Row) => ({
      userId: copy.must("User", owned.userId),
      itemId: copy.must("Asset", owned.assetId),
      quantity: dec(1),
      source: "PURCHASE",
      acquiredAt: owned.buyAt,
      syncedAt: new Date(),
    })),
  );
}

/** Contract NFTs keep their ids, and chain indexes stay exactly as the contract knows them. */
export async function copyNfts(copy: Copier) {
  const now = new Date();
  const creators = new Map((await copy.read("Creator")).map((c) => [c.id as string, c]));
  const nfts = await copy.read(`SELECT * FROM "Nft" ORDER BY "createdAt"`);
  for (const nft of nfts) {
    const media = mimeMedia(nft.mediaType);
    const itemId = copy.map("Nft", nft.id, true);
    await copy.insert("items", [
      {
        id: itemId,
        type: media.item,
        chainType: "CONTRACT_NFT",
        title: nft.name,
        slug: uniqueSlug(copy.slug("item"), nft.name),
        description: nft.description,
        coverUrl: nft.thumbnail,
        supply: nft.supply,
        royaltyPercent: (nft.royaltyBps / 100).toFixed(4),
        organizationId: copy.must("Creator", nft.creatorId),
        createdById: copy.must("User", nft.creatorId),
        createdAt: nft.createdAt,
        updatedAt: nft.updatedAt,
      },
    ]);
    await copy.insert("contract_nfts", [
      {
        itemId,
        contractAddress: nft.contractAddress,
        onChainEditionId: nft.onChainEditionId,
        royaltyBps: nft.royaltyBps,
        mintedCount: nft.mintedCount,
        status: nft.status,
        mintTxHash: nft.txHash,
      },
    ]);
    await copy.insert("item_media", [
      { itemId, mediaType: media.media, sourceUrl: nft.contentUrl, status: "LEGACY" },
    ]);
    if (media.item === "TRACK")
      await copy.insert("tracks", [
        { itemId, artistName: creators.get(nft.creatorId)?.name ?? "Unknown artist" },
      ]);
  }

  const tokens = await copy.read("NftToken");
  await copy.insert(
    "nft_editions",
    tokens.map((token) => ({
      id: copy.map("NftToken", token.id, true),
      itemId: copy.must("Nft", token.nftId),
      tokenId: token.tokenId,
      ownerId: copy.must("User", token.ownerId),
      createdAt: token.createdAt,
      updatedAt: token.updatedAt,
    })),
  );

  const locked = await copy.read("NftLockedMedia");
  await copy.insert(
    "locked_contents",
    locked.map((piece) => ({
      id: copy.map("NftLockedMedia", piece.id, true),
      itemId: copy.must("Nft", piece.nftId),
      url: piece.url,
      type: piece.type,
      label: piece.label,
      sortOrder: piece.sortOrder,
      chainIndex: piece.chainIndex,
      createdAt: piece.createdAt,
    })),
  );
  await copy.insert(
    "unlock_rules",
    (await copy.read("NftUnlockLocationRule")).map((rule) => ({
      id: copy.map("NftUnlockLocationRule", rule.id, true),
      lockedContentId: copy.must("NftLockedMedia", rule.lockedMediaId),
      radiusMeters: rule.radius,
      createdAt: rule.createdAt,
    })),
  );
  await copy.insert(
    "unlock_points",
    (await copy.read("NftUnlockLocationPoint")).map((point) => ({
      id: point.id,
      ruleId: copy.must("NftUnlockLocationRule", point.ruleId),
      label: point.label,
      latitude: point.latitude,
      longitude: point.longitude,
      sortOrder: point.sortOrder,
    })),
  );

  const tokenByChainId = new Map(tokens.map((token) => [String(token.tokenId), token]));
  const redeems: Row[] = [];
  for (const redeem of await copy.read("NftContentRedeem")) {
    const token = tokenByChainId.get(String(redeem.nftTokenId));
    const piece =
      token &&
      locked.find((one) => one.nftId === token.nftId && one.chainIndex === redeem.mediaIndex);
    if (!token || !piece) {
      copy.skip("NftContentRedeem", redeem.code, "its copy or locked piece no longer exists");
      continue;
    }
    redeems.push({
      code: redeem.code,
      editionId: token.id,
      lockedContentId: piece.id,
      redeemedAt: redeem.redeemedAt ?? (redeem.isRedeemed ? redeem.createdAt : null),
      redeemedById: copy.find("User", redeem.redeemedById),
      createdAt: redeem.createdAt,
    });
  }
  await copy.insert("locked_content_redeems", redeems);

  const prices = await copy.read("NftPrice");
  const priceOf = (nftId: string, token: string) =>
    prices.find((one) => one.nftId === nftId && one.paymentToken === token)?.price ?? null;
  const primary: Row[] = [];
  for (const nft of nfts) {
    if (!prices.some((one) => one.nftId === nft.id)) continue;
    const bandcoin = priceOf(nft.id, "asset");
    const usd = priceOf(nft.id, "usd");
    const soldOut = nft.supply > 0 && nft.mintedCount >= nft.supply;
    primary.push({
      id: copy.map("NftPrimaryListing", nft.id),
      itemId: copy.must("Nft", nft.id),
      sellerId: copy.must("User", nft.creatorId),
      kind: "PRIMARY",
      status: listingStatus({ bandcoin, usd, soldOut }),
      priceBandcoin: dec(bandcoin),
      priceUsd: dec(usd),
      quantity: nft.supply,
      quantitySold: nft.mintedCount,
      createdAt: nft.createdAt,
      updatedAt: now,
    });
  }
  await copy.insert("listings", primary);

  const resalePrices = await copy.read("NftListingPrice");
  const tokenById = new Map(tokens.map((token) => [String(token.tokenId), token]));
  await copy.insert(
    "listings",
    (await copy.read("NftListing")).map((listing) => {
      const bandcoin =
        resalePrices.find((p) => p.listingId === listing.id && p.paymentToken === "asset")?.price ??
        null;
      const usd =
        resalePrices.find((p) => p.listingId === listing.id && p.paymentToken === "usd")?.price ??
        null;
      const token = tokenById.get(String(listing.tokenId));
      return {
        id: copy.map("NftListing", listing.id, true),
        itemId: copy.must("Nft", listing.nftId),
        sellerId: copy.must("User", listing.sellerId),
        editionId: token ? token.id : null,
        kind: "RESALE",
        status: listing.isActive ? listingStatus({ bandcoin, usd }) : "CLOSED",
        priceBandcoin: dec(bandcoin),
        priceUsd: dec(usd),
        quantity: 1,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      };
    }),
  );

  await copy.insert(
    "orders",
    (await copy.read("NftPurchase")).map((purchase) => {
      const delivered = purchase.status === "CONFIRMED";
      return {
        id: copy.map("NftPurchase", purchase.id, true),
        kind: "NFT_PURCHASE",
        buyerId: copy.must("User", purchase.buyerId),
        listingId: copy.find("NftPrimaryListing", purchase.nftId),
        itemId: copy.must("Nft", purchase.nftId),
        quantity: purchase.quantity,
        currency: orderCurrency(purchase.paymentToken),
        unitPrice: dec(purchase.unitPrice),
        platformFee: dec(0),
        total: dec(purchase.unitPrice * purchase.quantity),
        method: purchase.paymentToken === "usd" ? "CARD" : "WALLET",
        status: orderStatus(purchase.status),
        failureCode: delivered ? null : "LEGACY_UNFINISHED",
        txHash: purchase.txHash,
        firstTokenId: purchase.firstTokenId,
        lastTokenId: purchase.lastTokenId,
        createdAt: purchase.createdAt,
        updatedAt: purchase.createdAt,
      };
    }),
  );
}

/** Marketplace listings of classic items. */
export async function copyMarket(copy: Copier) {
  const assets = new Map((await copy.read("Asset")).map((a) => [Number(a.id), a]));
  await copy.insert(
    "listings",
    (await copy.read("MarketAsset")).map((market) => {
      const asset = assets.get(Number(market.assetId));
      return {
        id: copy.map("MarketAsset", market.id),
        itemId: copy.must("Asset", market.assetId),
        sellerId: copy.must("User", market.placerId ?? asset?.creatorId),
        kind: "PRIMARY",
        status: listingStatus({ bandcoin: market.price, usd: market.priceUSD }),
        priceBandcoin: dec(market.price),
        priceUsd: dec(market.priceUSD),
        quantity: asset?.limit ?? null,
        createdAt: market.createdAt ?? market.placedAt,
        updatedAt: new Date(),
      };
    }),
  );
}
