import { Keypair } from "@stellar/stellar-sdk";

import { encryptSecret } from "../../../chain/src/server/secrets";
import type { Copier, Row } from "./copier";
import { artistStatus, dec, json, newId, STELLAR_PUBLIC, STELLAR_SECRET, uniqueSlug } from "./map";

/** Stores a platform-held key, encrypted. Returns its id, or null when the key isn't usable. */
export async function chainAccount(
  copy: Copier,
  input: {
    kind: "STORAGE" | "ISSUER";
    publicKey: string | null;
    secret: string | null;
    ownerId: string;
    createdAt: Date;
    ref: string;
    table: string;
  },
) {
  const { publicKey, secret } = input;
  if (!publicKey || !STELLAR_PUBLIC.test(publicKey) || !secret || !STELLAR_SECRET.test(secret)) {
    copy.skip(input.table, input.ref, `${input.kind} key unusable: no account stored`);
    return null;
  }
  if (Keypair.fromSecret(secret).publicKey() !== publicKey) {
    copy.skip(input.table, input.ref, `${input.kind} secret doesn't match its public key`);
    return null;
  }
  const id = newId();
  await copy.insert("chain_accounts", [
    {
      id,
      kind: input.kind,
      publicKey,
      secretEncrypted: encryptSecret(secret, copy.chainKey),
      ownerId: input.ownerId,
      activatedAt: input.createdAt,
      createdAt: input.createdAt,
    },
  ]);
  return id;
}

export async function copyUsers(copy: Copier) {
  const admins = new Set((await copy.read("Admin")).map((row) => row.id as string));
  const artists = new Map((await copy.read("Creator")).map((row) => [row.id as string, row]));
  const rows = (await copy.read(`SELECT * FROM "User" ORDER BY "joinedAt" NULLS LAST`)).map(
    (user) => {
      const artist = artists.get(user.id);
      return {
        id: copy.map("User", user.id),
        walletAddress: STELLAR_PUBLIC.test(user.id) ? user.id : null,
        email: user.email?.toLowerCase() ?? null,
        emailVerifiedAt: user.emailVerified,
        username: user.username,
        usernameChangedAt: user.usernameChangedAt,
        displayName: user.name,
        bio: user.bio,
        avatarUrl: user.image,
        coverUrl: user.coverImage,
        role: admins.has(user.id) ? "ADMIN" : artist?.approved === true ? "ARTIST" : "FAN",
        signUpMethod: user.firstSignUpMethod,
        signedUpFromApp: user.fromAppSignup ?? false,
        showCollection: user.showCollection,
        createdAt: user.joinedAt ?? new Date(),
        updatedAt: new Date(),
      };
    },
  );
  await copy.insert("users", rows);
  for (const id of admins)
    if (!copy.find("User", id)) throw new Error(`Admin ${id} has no user row.`);
}

export async function copyArtists(copy: Copier) {
  const pageAssets = new Map(
    (await copy.read("CreatorPageAsset")).map((row) => [row.creatorId as string, row]),
  );
  for (const creator of await copy.read(`SELECT * FROM "Creator" ORDER BY "createdAt"`)) {
    const userId = copy.must("User", creator.id);
    const storageAccountId = await chainAccount(copy, {
      kind: "STORAGE",
      publicKey: creator.storagePub,
      secret: creator.storageSecret,
      ownerId: userId,
      createdAt: creator.createdAt,
      ref: creator.id,
      table: "Creator.storageKey",
    });
    const fanToken = pageAssets.get(creator.id);
    const issuerAccountId = fanToken?.issuerPrivate
      ? await chainAccount(copy, {
          kind: "ISSUER",
          publicKey: fanToken.issuer,
          secret: fanToken.issuerPrivate,
          ownerId: userId,
          createdAt: creator.createdAt,
          ref: creator.id,
          table: "CreatorPageAsset.issuerKey",
        })
      : null;
    await copy.insert("organizations", [
      {
        id: copy.map("Creator", creator.id),
        userId,
        name: creator.name?.trim() || `Artist ${String(creator.id).slice(0, 6)}`,
        slug: uniqueSlug(copy.slug("artist"), creator.vanityURL ?? creator.name ?? creator.id),
        bio: creator.bio,
        avatarUrl: creator.profileUrl,
        coverUrl: creator.coverUrl,
        coverHeights: json({
          default: creator.coverHeightDefault,
          desktop: creator.coverHeightDesktop,
          mobile: creator.coverHeightMobile,
        }),
        sectionLayouts: json({
          default: creator.sectionLayoutDefault,
          desktop: creator.sectionLayoutDesktop,
          mobile: creator.sectionLayoutMobile,
        }),
        backgroundSvg: creator.backgroundSVG,
        showBackgroundSvg: creator.showSVG,
        website: creator.website,
        twitter: creator.twitter,
        instagram: creator.instagram,
        status: artistStatus(creator.approved),
        storageAccountId,
        issuerAccountId,
        createdAt: creator.createdAt,
        updatedAt: new Date(),
      },
    ]);
    if (creator.facebookPageToken)
      copy.skip(
        "Creator.facebook",
        creator.id,
        "Facebook token is sealed with the old app's key: the artist reconnects",
      );
  }
}

export async function copyArtistExtras(copy: Copier) {
  const now = new Date();
  const tierNames = new Map<string, Set<string>>();
  await copy.insert(
    "membership_tiers",
    (await copy.read("Subscription")).map((tier: Row) => {
      const organizationId = copy.must("Creator", tier.creatorId);
      const taken = tierNames.get(organizationId) ?? new Set<string>();
      tierNames.set(organizationId, taken);
      let name = tier.name as string;
      for (let n = 2; taken.has(name); n++) name = `${tier.name} ${n}`;
      taken.add(name);
      return {
        id: copy.map("Subscription", tier.id),
        organizationId,
        name,
        description: tier.description,
        features: tier.features ?? [],
        color: tier.color,
        isPopular: tier.popular,
        isActive: tier.isActive,
        requiredTokens: dec(tier.price),
        createdAt: now,
      };
    }),
  );

  const follows = await copy.read("Follow");
  const real = new Set(follows.map((row) => `${row.userId}:${row.creatorId}`));
  const row = (follow: Row, isTemporary: boolean) => ({
    userId: copy.must("User", follow.userId),
    organizationId: copy.must("Creator", follow.creatorId),
    isTemporary,
    createdAt: follow.followAt,
  });
  const temporary = (await copy.read("TemporalFollow")).filter((follow) => {
    if (!real.has(`${follow.userId}:${follow.creatorId}`)) return true;
    copy.skip("TemporalFollow", follow.id, "also a real follow: the real one wins");
    return false;
  });
  await copy.insert("follows", [
    ...follows.map((follow) => row(follow, false)),
    ...temporary.map((follow) => row(follow, true)),
  ]);

  const creators = new Map((await copy.read("Creator")).map((c) => [c.id as string, c]));
  await copy.insert(
    "vanity_urls",
    (await copy.read("VanitySubscription")).map((vanity: Row) => ({
      organizationId: copy.must("Creator", vanity.creatorId),
      name: String(creators.get(vanity.creatorId)?.vanityURL ?? vanity.creatorId).toLowerCase(),
      status: vanity.status,
      startedAt: vanity.startDate,
      paidUntil: vanity.endDate,
      graceEndsAt: vanity.graceEndsAt,
      reservedUntil: vanity.reservedUntil,
      updatedAt: now,
    })),
  );

  await copy.insert(
    "custom_domains",
    (await copy.read("CreatorCustomDomain")).map((domain: Row) => ({
      id: domain.id,
      organizationId: copy.must("Creator", domain.creatorId),
      domain: domain.domain,
      createdAt: now,
    })),
  );

  await copy.insert(
    "page_layouts",
    (await copy.read("Appearance")).map((layout: Row) => ({
      id: layout.id,
      organizationId: copy.find("Creator", layout.creatorId),
      name: layout.name,
      templateKey: layout.templateKey,
      isDefault: layout.isDefault,
      isPublic: layout.isPublic,
      isActive: layout.isActive,
      status: layout.status,
      theme: json(layout.theme),
      draftBlocks: json(layout.blocks),
      publishedBlocks: json(layout.publishedBlocks),
      publishedAt: layout.publishedAt,
      createdAt: layout.createdAt,
      updatedAt: layout.updatedAt,
    })),
  );

  await copy.insert(
    "page_templates",
    (await copy.read("LayoutTemplate")).map((template: Row) => ({
      id: template.id,
      key: template.key,
      name: template.name,
      description: template.description,
      previewImageUrl: template.previewImage,
      isSeedDefault: template.isSeedDefault,
      sortOrder: template.order,
      blocks: json(template.blocks),
      theme: json(template.theme),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    })),
  );

  await copy.insert(
    "lastfm_accounts",
    (await copy.read("LastFMAccount")).map((account: Row) => ({
      userId: copy.must("User", account.userId),
      username: account.username,
      realName: account.realName,
      country: account.country,
      sessionKey: account.sessionKey,
      profileUrl: account.profileUrl,
      imageUrl: account.image,
      playCount: account.playCount,
      isConnected: account.isConnected,
    })),
  );
}
