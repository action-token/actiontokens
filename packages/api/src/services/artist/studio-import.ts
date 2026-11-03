import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";

import type { Context, SessionUser } from "../../context";
import type { MixProject } from "../studio/projects";

/**
 * A Studio mixer project, brought into the new-song form: its name as the
 * title, the rendered mix as the song's audio, and each heard track as a stem
 * lined up with it. Only your own projects, and only files in our storage.
 */
export async function studioDraft(ctx: Pick<Context, "db">, user: SessionUser, projectId: string) {
  const project = await ctx.db.stemProject.findFirst({
    where: { id: projectId, ownerId: user.id },
    select: { id: true, name: true, data: true },
  });
  if (!project)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "That Studio project isn't yours or doesn't exist.",
    });
  const publish = (project.data as unknown as MixProject | null)?.publish;
  if (!publish)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "Press Publish as a song in the Studio mixer first.",
    });
  const files = [publish.audio.url, ...publish.stems.map((stem) => stem.url)];
  if (files.some((url) => !isOwnS3Url(url)))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Publish again from Studio: the files aren't in storage.",
    });
  return {
    projectId: project.id,
    title: project.name.slice(0, 120),
    audio: publish.audio,
    stems: publish.stems,
  };
}
