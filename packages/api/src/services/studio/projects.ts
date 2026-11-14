import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url, presignUpload } from "@bandcoin/storage";

import type { Context, SessionUser } from "../../context";

/**
 * Mixer projects, saved to the person's account (bandfan kept them in the
 * browser only). A project is its tracks (volume, pan, mute, solo), each holding clips (a
 * piece of an audio file in our storage placed on the timeline, trimmed and faded), the master
 * volume and the tempo. The audio itself lives in storage; the project only
 * points at it.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const MAX_TRACKS = 24;
export const MAX_CLIPS = 64;
export const MAX_PROJECTS = 100;
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
/** A mixer track may be any audio (the browser checks it can open it before uploading). */
const isAudioType = (type: string) => /^audio\/[\w.+-]+$/.test(type);

/** A piece of an audio file placed on a track. */
export type MixClip = {
  id: string;
  url: string;
  /** Where on the timeline it starts, in seconds */
  startTime: number;
  /** Seconds cut from the start and the end of the file */
  trimStart: number;
  trimEnd: number;
  /** The file's full length, in seconds */
  duration: number;
  fadeIn: number;
  fadeOut: number;
};
/** A 3-band EQ in dB (0 = untouched); missing means flat */
export type MixEq = { low: number; mid: number; high: number };
export type MixTrack = {
  id: string;
  name: string;
  color: string;
  volume: number;
  /** -1 (left) to 1 (right) */
  pan: number;
  muted: boolean;
  soloed: boolean;
  eq?: MixEq;
  clips: MixClip[];
};
/** What "Publish as a song" rendered: the mix, and each heard track lined up with it (stems). */
export type MixPublish = {
  audio: { url: string; durationSec: number };
  stems: { name: string; url: string; durationSec: number }[];
};
/**
 * Saved as version 2 (tracks holding clips). Older projects (one clip per
 * track) are converted by the mixer when it opens them.
 */
export type MixProject = {
  version: 2;
  bpm: number;
  snap: boolean;
  masterVolume: number;
  masterEq?: MixEq;
  tracks: MixTrack[];
  publish?: MixPublish | null;
};

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

/** Presigns an audio file for the mixer, after checking its type and size. */
export async function signStudioAudio(
  userId: string,
  file: {
    fileName: string;
    fileType: string;
    fileSize: number;
    checksum: string;
  },
) {
  if (!isAudioType(file.fileType))
    throw invalid("Add an audio file, like MP3, WAV, FLAC, M4A, OGG or AIFF.");
  if (file.fileSize > MAX_AUDIO_BYTES) throw invalid("Keep each audio file under 100 MB.");
  return presignUpload(file, { owner: "users", ownerId: userId, kind: "studio-audio" });
}

function checkProject(data: MixProject) {
  if (data.tracks.length > MAX_TRACKS) throw invalid(`A project holds up to ${MAX_TRACKS} tracks.`);
  for (const track of data.tracks) {
    if (track.clips.length > MAX_CLIPS)
      throw invalid(`${track.name} has too many clips: a track holds up to ${MAX_CLIPS} clips.`);
    for (const clip of track.clips) {
      if (!isOwnS3Url(clip.url))
        throw invalid(`Add ${track.name} again: its audio isn't in Studio.`);
      const length = clip.duration - clip.trimStart - clip.trimEnd;
      if (length <= 0)
        throw invalid(`A clip on ${track.name} is trimmed to nothing. Make it longer.`);
      if (clip.fadeIn + clip.fadeOut > length + 0.001)
        throw invalid(`A clip on ${track.name}: its fades are longer than the clip.`);
    }
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
