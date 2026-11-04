import type { Copier, Row } from "./copier";
import { approval, finishedJobStatus, json, visibility } from "./map";

/** Pins keep their ids, so QR codes and shared links keep working. */
export async function copyPins(copy: Copier) {
  const pins: Row[] = [];
  for (const pin of await copy.read(`SELECT * FROM "LocationGroup" ORDER BY "createdAt"`)) {
    const unlockEditionId = copy.find("NftToken", pin.unlockForTokenId);
    const unlockLockedContentId = copy.find("NftLockedMedia", pin.unlockForLockedMediaId);
    if (pin.unlockForTokenId && (!unlockEditionId || !unlockLockedContentId)) {
      copy.skip(
        "LocationGroup",
        pin.id,
        "unlock pin whose copy or piece is gone: it's remade when the owner opens the NFT",
      );
      continue;
    }
    if (pin.hotspotId)
      copy.skip("LocationGroup.hotspot", pin.id, "hotspot not copied: link dropped");
    pins.push({
      id: copy.map("LocationGroup", pin.id, true),
      artistId: copy.must("Creator", pin.creatorId),
      type: pin.type,
      title: pin.title,
      description: pin.description,
      imageUrl: pin.image,
      link: pin.link,
      visibility: visibility(pin.privacy),
      tierId: copy.find("Subscription", pin.subscriptionId),
      rewardItemId: copy.find("Asset", pin.assetId),
      rewardsFanToken: pin.pageAsset ?? false,
      claimLimit: pin.limit,
      claimsLeft: pin.remaining,
      startsAt: pin.startDate,
      endsAt: pin.endDate,
      latitude: pin.latitude,
      longitude: pin.longitude,
      radiusMeters: pin.radius,
      isMultiSpot: pin.multiPin,
      isHidden: pin.hidden,
      approval: approval(pin.approved),
      aiUrlDescriptions: pin.aiUrlDescriptions ?? [],
      restrictedToUserId: copy.find("User", pin.restrictedToUserId),
      unlockItemId: copy.find("Nft", pin.unlockForNftId),
      unlockEditionId,
      unlockLockedContentId,
      onChainUnlockedAt: pin.onChainUnlockedAt,
      onChainUnlockTxHash: pin.onChainUnlockTxHash,
      createdAt: pin.createdAt,
      updatedAt: pin.updatedAt,
    });
  }
  await copy.insert("pins", pins);

  const spots: Row[] = [];
  for (const spot of await copy.read("Location")) {
    const pinId = copy.find("LocationGroup", spot.locationGroupId);
    if (!pinId) {
      copy.skip("Location", spot.id, "its pin wasn't copied");
      continue;
    }
    spots.push({
      id: copy.map("Location", spot.id, true),
      pinId,
      latitude: spot.latitude,
      longitude: spot.longitude,
      isHidden: spot.hidden,
      autoCollect: spot.autoCollect,
    });
  }
  await copy.insert("pin_spots", spots);

  const claims: Row[] = [];
  for (const claim of await copy.read("LocationConsumer")) {
    const spotId = copy.find("Location", claim.locationId);
    if (!spotId) {
      copy.skip("LocationConsumer", claim.id, "its spot wasn't copied");
      continue;
    }
    claims.push({
      id: claim.id,
      userId: copy.must("User", claim.userId),
      spotId,
      redeemCode: claim.redeemCode,
      isRedeemed: claim.isRedeemed,
      redeemedAt: claim.redeemedAt,
      claimedAt: claim.claimedAt,
      tokenClaimedAt: claim.tokenClaimedAt,
      viewedAt: claim.viewedAt,
      isHidden: claim.hidden,
      createdAt: claim.createdAt,
    });
  }
  await copy.insert("pin_claims", claims);

  await copy.insert(
    "pin_tags",
    (await copy.read("LocationTag")).map((tag: Row) => ({
      id: copy.map("LocationTag", tag.id, true),
      artistId: copy.must("Creator", tag.creatorId),
      name: tag.name,
      label: tag.label,
    })),
  );
  const links: Row[] = [];
  for (const link of await copy.read("LocationGroupTag")) {
    const pinId = copy.find("LocationGroup", link.locationGroupId);
    if (!pinId) {
      copy.skip(
        "LocationGroupTag",
        `${link.locationGroupId}/${link.tagId}`,
        "its pin wasn't copied",
      );
      continue;
    }
    links.push({ pinId, tagId: copy.must("LocationTag", link.tagId) });
  }
  await copy.insert("pin_tag_links", links);

  await copy.insert(
    "pin_tag_cache",
    (await copy.read("LocationTagCache")).map((row: Row) => ({
      title: row.title,
      tags: row.tags ?? [],
      createdAt: row.createdAt,
    })),
  );
  await copy.insert(
    "geo_cache",
    (await copy.read("GeoCache")).map((row: Row) => ({
      key: row.key,
      value: row.value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
  await copy.insert(
    "pin_batch_jobs",
    (await copy.read("LocationGroupJob")).map((job: Row) => ({
      id: job.id,
      artistId: copy.must("Creator", job.creatorId),
      status: finishedJobStatus(job.status),
      total: job.total,
      completed: job.completed,
      payload: json(job.payload),
      redeemMode: job.redeemMode,
      log: json(job.log),
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })),
  );
}
