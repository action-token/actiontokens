import { z } from "zod";

import {
  hotspotTemplateDataSchema,
  PIN_TEMPLATE_FORM_TYPES,
  pinTemplateDataSchema,
  templateNameSchema,
} from "@actiontokens/ar-core/pin-template";

import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "../../services/artist/templates";
import { artistProcedure, createRouter } from "../../trpc";

const id = z.object({ id: z.string().min(1) });

const saveInput = z.discriminatedUnion("formType", [
  z.object({ formType: z.literal("PIN"), data: pinTemplateDataSchema }),
  z.object({ formType: z.literal("HOTSPOT"), data: hotspotTemplateDataSchema }),
]);

/** An artist's saved pin and hotspot setups (see services/artist/templates). */
export const templatesRouter = createRouter({
  list: artistProcedure
    .input(z.object({ formType: z.enum(PIN_TEMPLATE_FORM_TYPES).optional() }).optional())
    .query(({ ctx, input }) => listTemplates(ctx, ctx.artist, input?.formType)),

  get: artistProcedure.input(id).query(({ ctx, input }) => getTemplate(ctx, ctx.artist, input.id)),

  create: artistProcedure
    .input(z.object({ name: templateNameSchema }).and(saveInput))
    .mutation(({ ctx, input }) => createTemplate(ctx, ctx.artist, input)),

  update: artistProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: templateNameSchema.optional(),
        /** Replaces the saved values (the kind of template can't change). */
        data: z.union([pinTemplateDataSchema, hotspotTemplateDataSchema]).optional(),
      }),
    )
    .mutation(({ ctx, input }) => updateTemplate(ctx, ctx.artist, input)),

  duplicate: artistProcedure
    .input(id)
    .mutation(({ ctx, input }) => duplicateTemplate(ctx, ctx.artist, input.id)),

  delete: artistProcedure
    .input(id)
    .mutation(({ ctx, input }) => deleteTemplate(ctx, ctx.artist, input.id)),
});
