import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../context";
import {
  getProject,
  type MixClip,
  type MixTrack,
  removeProject,
  saveProject,
  signStudioAudio,
} from "../services/studio/projects";

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
    await expect(signStudioAudio(file)).resolves.toMatchObject({ fileUrl: "https://bucket/k" });
    await expect(signStudioAudio({ ...file, fileType: "image/png" })).rejects.toThrow(/audio file/);
    for (const fileType of ["audio/aiff", "audio/opus", "audio/x-caf", "audio/flac"])
      await expect(signStudioAudio({ ...file, fileType })).resolves.toBeTruthy();
    await expect(signStudioAudio({ ...file, fileSize: 200 * 1024 * 1024 })).rejects.toThrow(
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
