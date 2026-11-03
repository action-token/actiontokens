import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url, presignUpload } from "@bandcoin/storage";

import type { Context, SessionUser } from "../../context";

/**
 * Mixer projects, saved to the person's account (bandfan kept them in the
 * browser only). A project is its tracks (each an audio file in our storage,
 * placed on the timeline with its trim, volume, mute and solo), the master
 * volume and the tempo. The audio itself lives in storage; the project only
 * points at it.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const MAX_TRACKS = 24;
export const MAX_PROJECTS = 100;
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
/** The audio a mixer track may be: what browsers can decode. */
export const AUDIO_TYPES: readonly string[] = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/webm",
];

export type MixTrack = {
  id: string;
  name: string;
  url: string;
  /** Where on the timeline it starts, in seconds */
  startTime: number;
  /** Seconds cut from the start and the end of the file */
  trimStart: number;
  trimEnd: number;
  /** The file's full length, in seconds */
  duration: number;
  volume: number;
  muted: boolean;
  soloed: boolean;
  color: string;
};
/** What "Publish as a song" rendered: the mix, and each heard track lined up with it (stems). */
export type MixPublish = {
  audio: { url: string; durationSec: number };
  stems: { name: string; url: string; durationSec: number }[];
};
export type MixProject = {
  bpm: number;
  masterVolume: number;
  tracks: MixTrack[];
  publish?: MixPublish | null;
};

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

/** Presigns an audio file for the mixer, after checking its type and size. */
export async function signStudioAudio(file: {
  fileName: string;
  fileType: string;
  fileSize: number;
  checksum: string;
}) {
  if (!AUDIO_TYPES.includes(file.fileType))
    throw invalid("Add an audio file: MP3, WAV, OGG, AAC, M4A, FLAC or WebM.");
  if (file.fileSize > MAX_AUDIO_BYTES) throw invalid("Keep each audio file under 100 MB.");
  return presignUpload(file);
}

function checkProject(data: MixProject) {
  if (data.tracks.length > MAX_TRACKS) throw invalid(`A project holds up to ${MAX_TRACKS} tracks.`);
  for (const track of data.tracks) {
    if (!isOwnS3Url(track.url))
      throw invalid(`Add ${track.name} again: its audio isn't in Studio.`);
    if (track.trimStart + track.trimEnd >= track.duration)
      throw invalid(`${track.name} is trimmed to nothing. Make it longer.`);
  }
  if (data.publish) {
    const files = [data.publish.audio.url, ...data.publish.stems.map((stem) => stem.url)];
    if (files.some((url) => !isOwnS3Url(url)))
      throw invalid("Publish again: the files aren't in Studio.");
  }
}

export async function listProjects(ctx: Pick<Context, "db">, user: SessionUser) {
  const rows = await ctx.db.stemProject.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJECTS,
    select: { id: true, name: true, data: true, updatedAt: true },
  });
  return rows.map(({ data, ...row }) => ({
    ...row,
    tracks: ((data as MixProject | null)?.tracks ?? []).length,
  }));
}

async function ownProject(ctx: Pick<Context, "db">, user: SessionUser, projectId: string) {
  const project = await ctx.db.stemProject.findFirst({
    where: { id: projectId, ownerId: user.id },
    select: { id: true, name: true, data: true, updatedAt: true },
  });
  if (!project) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Project not found" });
  return project;
}

export async function getProject(ctx: Pick<Context, "db">, user: SessionUser, projectId: string) {
  const project = await ownProject(ctx, user, projectId);
  return { ...project, data: project.data as unknown as MixProject };
}

/** Saves a new project, or the changes to one of yours. */
export async function saveProject(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { projectId?: string | null; name: string; data: MixProject },
) {
  const name = input.name.trim() || "Untitled mix";
  checkProject(input.data);
  const data = input.data as unknown as Prisma.InputJsonValue;
  if (input.projectId) {
    await ownProject(ctx, user, input.projectId);
    await ctx.db.stemProject.update({ where: { id: input.projectId }, data: { name, data } });
    ctx.activity.set({ targetType: "StemProject", targetId: input.projectId });
    return { projectId: input.projectId };
  }
  const count = await ctx.db.stemProject.count({ where: { ownerId: user.id } });
  if (count >= MAX_PROJECTS)
    throw invalid(`You have ${MAX_PROJECTS} projects. Delete one to start another.`);
  const created = await ctx.db.stemProject.create({
    data: { ownerId: user.id, name, data },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "StemProject", targetId: created.id });
  return { projectId: created.id };
}

export async function removeProject(ctx: ServiceCtx, user: SessionUser, projectId: string) {
  const project = await ownProject(ctx, user, projectId);
  await ctx.db.stemProject.delete({ where: { id: project.id } });
  ctx.activity.set({ targetType: "StemProject", targetId: project.id });
  return { projectId: project.id };
}
