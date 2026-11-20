import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";

type ServiceCtx = Pick<Context, "db">;

/** Telegram's MarkdownV2 wants these escaped in any text we didn't write ourselves. */
export const escapeMarkdown = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");

type Config = { botToken: string; chatId: string };

/** One message to the channel. Throws on a refusal, so the job retries and the admin test can show why. */
export async function sendTelegram(
  config: Config,
  text: string,
  options: { markdown?: boolean; fetcher?: typeof fetch } = {},
) {
  const response = await (options.fetcher ?? fetch)(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        disable_web_page_preview: true,
        ...(options.markdown ? { parse_mode: "MarkdownV2" } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    // The bot token is in the URL, never in this message.
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: `Telegram refused the message (${response.status}): ${(await response.text()).slice(0, 200)}`,
    });
}

/** The saved bot and channel, only when on and complete. */
export async function activeTelegram(ctx: ServiceCtx): Promise<Config | null> {
  const row = await ctx.db.telegramConfig.findFirst({ orderBy: { id: "asc" } });
  return row?.enabled && row.botToken && row.chatId
    ? { botToken: row.botToken, chatId: row.chatId }
    : null;
}

export type BountyAnnouncement = {
  id: string;
  title: string;
  summary: string;
  prizeAmount: string;
  prizeCode: string;
  maxWinners: number;
  by: string;
  requiresActionCam: boolean;
};

export function bountyMessage(bounty: BountyAnnouncement, appUrl: string): string {
  const perWinner = Number(bounty.prizeAmount) / bounty.maxWinners;
  return [
    "🎯 *New bounty posted*",
    "",
    `*${escapeMarkdown(bounty.title)}*`,
    escapeMarkdown(bounty.summary),
    "",
    ...(bounty.requiresActionCam
      ? ["🎥 *Action Cam required* — proof must be live\\-captured & sealed"]
      : []),
    `💰 Reward: ${escapeMarkdown(`${perWinner} ${bounty.prizeCode}`)} per winner`,
    `🙋 Claims available: ${bounty.maxWinners}`,
    `👤 Posted by: ${escapeMarkdown(bounty.by)}`,
    "",
    `👉 [View bounty & claim](${appUrl.replace(/\/$/, "")}/bounty/${bounty.id})`,
  ].join("\n");
}

/**
 * Posts a funded bounty to the channel, if Telegram is on. A bounty that's gone, or hidden since,
 * isn't announced. Called by the worker, so a Telegram outage retries instead of losing the post.
 */
export async function announceBounty(
  ctx: ServiceCtx,
  bountyId: string,
  options: { fetcher?: typeof fetch; appUrl?: string } = {},
) {
  const config = await activeTelegram(ctx);
  if (!config) return { sent: false, reason: "Telegram is off" };
  const bounty = await ctx.db.bounty.findUnique({
    where: { id: bountyId },
    select: {
      id: true,
      title: true,
      summary: true,
      prizeAmount: true,
      prizeCurrency: true,
      prizeAssetCode: true,
      maxWinners: true,
      requiresActionCam: true,
      hiddenAt: true,
      organization: { select: { name: true } },
    },
  });
  if (!bounty || bounty.hiddenAt) return { sent: false, reason: "Bounty isn't public" };
  const text = bountyMessage(
    {
      id: bounty.id,
      title: bounty.title,
      summary: bounty.summary,
      prizeAmount: bounty.prizeAmount.toString(),
      prizeCode: bounty.prizeAssetCode ?? bounty.prizeCurrency ?? "",
      maxWinners: bounty.maxWinners,
      by: bounty.organization.name,
      requiresActionCam: bounty.requiresActionCam,
    },
    options.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://app.action-tokens.com",
  );
  await sendTelegram(config, text, { markdown: true, fetcher: options.fetcher });
  return { sent: true };
}
