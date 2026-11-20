import type { Copier, Row } from "./copier";

/**
 * The 3D gallery: music and text, framed artworks, rooms and likes. A creator becomes an
 * organization; integer ids become cuids. Rows whose creator or fan didn't carry over are
 * skipped and listed in the report.
 */
export async function copyGallery(copy: Copier) {
  await copy.insert(
    "creator_galleries",
    (await copy.read("CreatorGallery")).flatMap((row: Row) => {
      const organizationId = copy.find("Creator", row.creatorId);
      if (!organizationId)
        return (copy.skip("CreatorGallery", row.creatorId, "its creator wasn't migrated"), []);
      return [
        {
          organizationId,
          musicUrl: row.musicURL,
          creatorTitle: row.creatorTitle,
          creatorDescription: row.creatorDescription,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      ];
    }),
  );
  await copy.insert(
    "museum_rooms",
    (await copy.read("MuseumRoom")).flatMap((row: Row) => {
      const organizationId = copy.find("Creator", row.creatorId);
      if (!organizationId)
        return (copy.skip("MuseumRoom", row.id, "its creator wasn't migrated"), []);
      return [
        {
          id: copy.map("MuseumRoom", row.id),
          organizationId,
          roomIndex: row.roomIndex,
          label: row.label,
          northDoorCell: row.northDoorCell,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      ];
    }),
  );
  await copy.insert(
    "gallery_slot_overrides",
    (await copy.read("GallerySlotOverride")).flatMap((row: Row) => {
      const organizationId = copy.find("Creator", row.creatorId);
      if (!organizationId)
        return (copy.skip("GallerySlotOverride", row.id, "its creator wasn't migrated"), []);
      return [
        {
          id: copy.map("GallerySlotOverride", row.id),
          organizationId,
          slotId: row.slotId,
          roomIndex: row.roomIndex,
          imageUrl: row.imageUrl,
          title: row.title,
          description: row.description,
          aspectRatio: row.aspectRatio,
          photoDescription: row.photoDescription,
          photoDescPlacement: row.photoDescPlacement,
          gridCell: row.gridCell,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      ];
    }),
  );
  await copy.insert(
    "gallery_slot_likes",
    (await copy.read("GallerySlotLike")).flatMap((row: Row) => {
      const organizationId = copy.find("Creator", row.creatorId);
      const userId = copy.find("User", row.userId);
      if (!organizationId || !userId)
        return (copy.skip("GallerySlotLike", row.id, "its creator or fan wasn't migrated"), []);
      return [
        {
          id: copy.map("GallerySlotLike", row.id),
          organizationId,
          slotId: row.slotId,
          roomIndex: row.roomIndex,
          userId,
          createdAt: row.createdAt,
        },
      ];
    }),
  );
}
