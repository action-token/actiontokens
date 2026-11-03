import { z } from "zod";

import {
  getProject,
  listProjects,
  MAX_TRACKS,
  removeProject,
  saveProject,
  signStudioAudio,
} from "../../services/studio/projects";
import { authedProcedure, createRouter } from "../../trpc";

const seconds = z.number().min(0).max(3600);
const track = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  url: z.string().url().max(500),
  startTime: seconds,
  trimStart: seconds,
  trimEnd: seconds,
  duration: z.number().positive().max(3600),
  volume: z.number().min(0).max(1.5),
  muted: z.boolean(),
  soloed: z.boolean(),
  color: z.string().max(20),
});
const rendered = z.object({
  url: z.string().url().max(500),
  durationSec: z.number().int().min(1).max(21_600),
});
const project = z.object({
  bpm: z.number().min(40).max(240),
  masterVolume: z.number().min(0).max(1.5),
  tracks: z.array(track).max(MAX_TRACKS),
  publish: z
    .object({
      audio: rendered,
      stems: z.array(rendered.extend({ name: z.string().trim().min(1).max(30) })).max(8),
    })
    .nullish(),
});
const projectId = z.object({ projectId: z.string().min(1) });

/** The mixer: audio uploads and projects saved to your account (see services/studio/projects). */
export const projectsRouter = createRouter({
  /** A presigned upload for one audio file. */
  upload: authedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(200),
        fileType: z.string().min(1).max(100),
        fileSize: z.number().int().positive(),
        checksum: z.string().min(1).max(100),
      }),
    )
    .mutation(({ input }) => signStudioAudio(input)),

  list: authedProcedure.query(({ ctx }) => listProjects(ctx, ctx.session.user)),

  get: authedProcedure
    .input(projectId)
    .query(({ ctx, input }) => getProject(ctx, ctx.session.user, input.projectId)),

  save: authedProcedure
    .input(
      z.object({
        projectId: z.string().min(1).nullish(),
        name: z.string().max(80),
        data: project,
      }),
    )
    .mutation(({ ctx, input }) => saveProject(ctx, ctx.session.user, input)),

  remove: authedProcedure
    .input(projectId)
    .mutation(({ ctx, input }) => removeProject(ctx, ctx.session.user, input.projectId)),
});
