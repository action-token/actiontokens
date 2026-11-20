import { Prisma, type Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";
import {
  isBuiltinShape,
  lookToColumns,
  pinLookInputSchema,
  type PinLookColumns,
  type PinLookInput,
} from "@actiontokens/ar-core/pin-look";

/**
 * Pin look on the server (plan 43): turning what a form sent into the stored columns, checking
 * that an own shape really is that artist's, and what to select to draw a look.
 */

/** Select this on a pin or hotspot to be able to draw its look. */
export const PIN_LOOK_SELECT = {
  markerShape: true,
  pinShapeId: true,
  markerFill: true,
  markerColor: true,
  markerImageFit: true,
  markerAutoBadge: true,
  pinShape: { select: { path: true, anchor: true } },
} as const;

/**
 * The columns to store for `look` on `artistId`'s pin or hotspot. A shape id that isn't built in
 * must be one of that artist's own shapes (archived ones included, so a template or an existing
 * pin keeps working). `undefined` look = leave the stored look alone (for updates).
 */
export async function lookColumnsFor(
  db: Pick<Db, "pinShape">,
  artistId: string,
  look: PinLookInput | null | undefined,
): Promise<PinLookColumns | undefined> {
  if (look === undefined) return undefined;
  const parsed = pinLookInputSchema.safeParse(look ?? {});
  if (!parsed.success)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: parsed.error.issues[0]?.message ?? "Check the pin's look",
    });
  const shape = parsed.data.shape ?? null;
  if (!shape || isBuiltinShape(shape)) return lookToColumns(parsed.data, false);
  const own = await db.pinShape.findFirst({ where: { id: shape, artistId }, select: { id: true } });
  if (!own)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "That pin shape isn't available. Choose another.",
    });
  return lookToColumns(parsed.data, true);
}

/** Look columns as Prisma write data (a missing image fit is SQL NULL). */
export function lookData(columns: PinLookColumns) {
  return {
    markerShape: columns.markerShape,
    pinShapeId: columns.pinShapeId,
    markerFill: columns.markerFill,
    markerColor: columns.markerColor,
    markerImageFit:
      columns.markerImageFit == null
        ? Prisma.DbNull
        : (columns.markerImageFit as Prisma.InputJsonValue),
    markerAutoBadge: columns.markerAutoBadge,
  };
}

/** Copies the look columns from one row (a hotspot) for another (its drop). */
export function copyLook(from: Partial<PinLookColumns>): PinLookColumns {
  return {
    markerShape: from.markerShape ?? null,
    pinShapeId: from.pinShapeId ?? null,
    markerFill: from.markerFill ?? "ARTIST",
    markerColor: from.markerColor ?? null,
    markerImageFit: from.markerImageFit ?? null,
    markerAutoBadge: from.markerAutoBadge ?? true,
  };
}
