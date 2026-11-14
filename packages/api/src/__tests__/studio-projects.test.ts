import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { studioRouter } from "../root-studio";
import type { ChainGateway } from "../services/chain-gateway";
import {
  getProject,
  type MixClip,
  type MixTrack,
  removeProject,
  saveProject,
  signStudioAudio,
} from "../services/studio/projects";

import { createCallerFactory } from "../trpc";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://bucket/"),
  presignUpload: vi
    .fn()
    .mockResolvedValue({ uploadUrl: "https://put", fileUrl: "https://bucket/k" }),
}));

const user: SessionUser = { id: "u1", role: "FAN", walletAddress: "G1", walletType: "email" };
const clip = (over: Partial<MixClip> = {}): MixClip => ({
  id: "c1",
  url: "https://bucket/beat.mp3",
  startTime: 0,
  trimStart: 0,
  trimEnd: 0,
  duration: 30,
  fadeIn: 0,
  fadeOut: 0,
  ...over,
});
const track = (over: Partial<MixTrack> = {}, clips: MixClip[] = [clip()]): MixTrack => ({
  id: "t1",
  name: "Beat",
  color: "#dbdc2c",
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
  clips,
  ...over,
});

function setup(owned = true, count = 0) {
  const db = {
    stemProject: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          owned ? { id: "p1", name: "Mix", data: { tracks: [] }, updatedAt: new Date() } : null,
        ),
      create: vi.fn().mockResolvedValue({ id: "p9" }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(count),
    },
  };
  return { ctx: { db, activity: { set: vi.fn() } } as never, db };
}

const project = (tracks: MixTrack[]) => ({
  version: 2 as const,
  bpm: 120,
  masterVolume: 1,
  snap: true,
  tracks,
});

describe("mixer uploads", () => {
  it("signs audio only, up to 100 MB", async () => {
    const file = { fileName: "a.mp3", fileType: "audio/mpeg", fileSize: 1000, checksum: "x" };
    await expect(signStudioAudio("u1", file)).resolves.toMatchObject({
      fileUrl: "https://bucket/k",
    });
    await expect(signStudioAudio("u1", { ...file, fileType: "image/png" })).rejects.toThrow(
      /audio file/,
    );
    for (const fileType of ["audio/aiff", "audio/opus", "audio/x-caf", "audio/flac"])
      await expect(signStudioAudio("u1", { ...file, fileType })).resolves.toBeTruthy();
    await expect(signStudioAudio("u1", { ...file, fileSize: 200 * 1024 * 1024 })).rejects.toThrow(
      /100 MB/,
    );
  });
});

describe("mixer projects", () => {
  it("saves a new project with a default name", async () => {
    const { ctx, db } = setup();
    expect(await saveProject(ctx, user, { name: "  ", data: project([track()]) })).toEqual({
      projectId: "p9",
    });
    expect(db.stemProject.create).toHaveBeenCalledWith({
      data: { ownerId: "u1", name: "Untitled mix", data: project([track()]) },
      select: { id: true },
    });
  });

  it("keeps tracks to audio in Studio's storage, and never trimmed to nothing", async () => {
    const { ctx } = setup();
    await expect(
      saveProject(ctx, user, {
        name: "Mix",
        data: project([track({}, [clip({ url: "https://elsewhere/x.mp3" })])]),
      }),
    ).rejects.toThrow(/Add Beat again/);
    await expect(
      saveProject(ctx, user, {
        name: "Mix",
        data: project([track({}, [clip(), clip({ id: "c2", trimStart: 20, trimEnd: 10 })])]),
      }),
    ).rejects.toThrow(/trimmed to nothing/);
  });

  it("keeps fades inside their clip, and clips to 64 a track", async () => {
    const { ctx } = setup();
    await expect(
      saveProject(ctx, user, {
        name: "Mix",
        data: project([track({}, [clip({ trimEnd: 20, fadeIn: 6, fadeOut: 6 })])]),
      }),
    ).rejects.toThrow(/fades are longer/);
    const many = Array.from({ length: 65 }, (_, index) => clip({ id: `c${index}` }));
    await expect(
      saveProject(ctx, user, { name: "Mix", data: project([track({}, many)]) }),
    ).rejects.toThrow(/64 clips/);
  });

  it("only opens, changes or deletes your own projects", async () => {
    const { ctx, db } = setup(false);
    await expect(getProject(ctx, user, "p1")).rejects.toThrow(/not found/);
    await expect(
      saveProject(ctx, user, { projectId: "p1", name: "Mix", data: project([]) }),
    ).rejects.toThrow(/not found/);
    await expect(removeProject(ctx, user, "p1")).rejects.toThrow(/not found/);
    expect(db.stemProject.delete).not.toHaveBeenCalled();
  });

  it("stops at 100 projects", async () => {
    const { ctx } = setup(true, 100);
    await expect(saveProject(ctx, user, { name: "Mix", data: project([]) })).rejects.toThrow(
      /100 projects/,
    );
  });
});

describe("mixer EQ", () => {
  const callerFor = (db: unknown) =>
    createCallerFactory(studioRouter)(
      createContext({
        db: db as Db,
        chain: {} as ChainGateway,
        app: "studio",
        session: { user },
      }),
    );
  const dbFor = () => ({
    ...setup().db,
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  });

  it("saves the mix's EQ and each track's with the project", async () => {
    const db = dbFor();
    const eq = { low: 3, mid: -12, high: 12 };
    const data = { ...project([track({ eq })]), masterEq: { low: -2.5, mid: 0, high: 1 } };
    await expect(callerFor(db).projects.save({ name: "Mix", data })).resolves.toEqual({
      projectId: "p9",
    });
    expect(db.stemProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            masterEq: { low: -2.5, mid: 0, high: 1 },
            tracks: [expect.objectContaining({ eq })],
          }),
        }),
      }),
    );
  });

  it("still saves a project with no EQ, and refuses a band past 12 dB", async () => {
    const db = dbFor();
    const caller = callerFor(db);
    await expect(caller.projects.save({ name: "Mix", data: project([track()]) })).resolves.toEqual({
      projectId: "p9",
    });
    const loud = project([track({ eq: { low: 12.5, mid: 0, high: 0 } })]);
    await expect(caller.projects.save({ name: "Mix", data: loud })).rejects.toThrow();
    const master = { ...project([track()]), masterEq: { low: 0, mid: 0, high: -13 } };
    await expect(caller.projects.save({ name: "Mix", data: master })).rejects.toThrow();
    expect(db.stemProject.create).toHaveBeenCalledTimes(1);
  });
});
