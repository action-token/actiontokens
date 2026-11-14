import { Prisma } from "@bandcoin/db";
import {
  MAX_TEMPLATES_PER_ARTIST,
  hotspotTemplateDataSchema,
  pinTemplateDataSchema,
  readTemplateData,
  TEMPLATE_SCHEMA_VERSION,
  templateHasLocation,
  type HotspotTemplateData,
  type PinTemplateData,
  type PinTemplateFormType,
} from "@bandcoin/ar-core/pin-template";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";

/**
 * Pin templates (plan 43): an artist's saved pin and hotspot setups. Plain reads and writes on
 * `PinTemplate`; everything is the artist's own. The data is checked against its kind's schema
 * on the way in and read leniently on the way out, so a template always opens.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

const SELECT = {
  id: true,
  name: true,
  formType: true,
  data: true,
  schemaVersion: true,
  hasLocation: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Prisma.PinTemplateGetPayload<{ select: typeof SELECT }>;

const asFormType = (value: string): PinTemplateFormType =>
  value === "HOTSPOT" ? "HOTSPOT" : "PIN";

/** A row as the app sees it: data upgraded and cleaned, so the form can always open it. */
function present(
  row: Row,
):
  | (Omit<Row, "formType" | "data"> & { formType: "PIN"; data: PinTemplateData })
  | (Omit<Row, "formType" | "data"> & { formType: "HOTSPOT"; data: HotspotTemplateData }) {
  const { data, ...rest } = row;
  return asFormType(row.formType) === "PIN"
    ? { ...rest, formType: "PIN", data: readTemplateData("PIN", data, row.schemaVersion) }
    : { ...rest, formType: "HOTSPOT", data: readTemplateData("HOTSPOT", data, row.schemaVersion) };
}
export type PinTemplateView = ReturnType<typeof present>;

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

/** Checks `data` against its kind's schema (a pin template can't carry hotspot fields). */
function checkData(formType: PinTemplateFormType, data: unknown) {
  const parsed = (formType === "PIN" ? pinTemplateDataSchema : hotspotTemplateDataSchema).safeParse(
    data,
  );
  if (!parsed.success)
    throw invalid(parsed.error.issues[0]?.message ?? "That template couldn't be saved.");
  return parsed.data as PinTemplateData | HotspotTemplateData;
}

const toJson = (data: PinTemplateData | HotspotTemplateData) => data as Prisma.InputJsonValue;

export async function listTemplates(
  ctx: Pick<Context, "db">,
  artist: ArtistRef,
  formType?: PinTemplateFormType,
) {
  const rows = await ctx.db.pinTemplate.findMany({
    where: { artistId: artist.id, ...(formType ? { formType } : {}) },
    orderBy: { updatedAt: "desc" },
    take: MAX_TEMPLATES_PER_ARTIST,
    select: SELECT,
  });
  return rows.map(present);
}

async function ownTemplate(ctx: ServiceCtx, artist: ArtistRef, id: string) {
  const row = await ctx.db.pinTemplate.findFirst({
    where: { id, artistId: artist.id },
    select: SELECT,
  });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Template not found" });
  ctx.activity.set({ targetType: "PinTemplate", targetId: row.id });
  return row;
}

export async function getTemplate(ctx: ServiceCtx, artist: ArtistRef, id: string) {
  return present(await ownTemplate(ctx, artist, id));
}

async function assertRoom(ctx: ServiceCtx, artist: ArtistRef) {
  const have = await ctx.db.pinTemplate.count({ where: { artistId: artist.id } });
  if (have >= MAX_TEMPLATES_PER_ARTIST)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `You can keep up to ${MAX_TEMPLATES_PER_ARTIST} templates. Delete some you no longer use.`,
    });
}

export async function createTemplate(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { name: string; formType: PinTemplateFormType; data: unknown },
) {
  const data = checkData(input.formType, input.data);
  await assertRoom(ctx, artist);
  const row = await ctx.db.pinTemplate.create({
    data: {
      artistId: artist.id,
      name: input.name,
      formType: input.formType,
      data: toJson(data),
      schemaVersion: TEMPLATE_SCHEMA_VERSION,
      hasLocation: templateHasLocation(input.formType, data),
    },
    select: SELECT,
  });
  ctx.activity.set({ targetType: "PinTemplate", targetId: row.id });
  return present(row);
}

/** Renames a template and/or replaces its saved values (the kind can't change). */
export async function updateTemplate(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { id: string; name?: string; data?: unknown },
) {
  const row = await ownTemplate(ctx, artist, input.id);
  const formType = asFormType(row.formType);
  const data = input.data === undefined ? undefined : checkData(formType, input.data);
  const updated = await ctx.db.pinTemplate.update({
    where: { id: row.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(data
        ? {
            data: toJson(data),
            schemaVersion: TEMPLATE_SCHEMA_VERSION,
            hasLocation: templateHasLocation(formType, data),
          }
        : {}),
    },
    select: SELECT,
  });
  return present(updated);
}

export async function duplicateTemplate(ctx: ServiceCtx, artist: ArtistRef, id: string) {
  const row = await ownTemplate(ctx, artist, id);
  await assertRoom(ctx, artist);
  const copy = await ctx.db.pinTemplate.create({
    data: {
      artistId: artist.id,
      name: `${row.name} (copy)`.slice(0, 80),
      formType: row.formType,
      data: row.data as Prisma.InputJsonValue,
      schemaVersion: row.schemaVersion,
      hasLocation: row.hasLocation,
    },
    select: SELECT,
  });
  return present(copy);
}

export async function deleteTemplate(ctx: ServiceCtx, artist: ArtistRef, id: string) {
  const row = await ownTemplate(ctx, artist, id);
  await ctx.db.pinTemplate.delete({ where: { id: row.id } });
  return { id: row.id };
}
