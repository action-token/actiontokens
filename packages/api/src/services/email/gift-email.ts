import type { Context } from "../../context";
import { lockedForOwner } from "../catalog/locked-view";
import type { NftGiftDetails } from "../orders/finish";
import type { EmailMessage } from "./mailer";

/**
 * The email someone gets when an artist gives them an NFT copy, as on the old
 * Bandcoin: what it is, who sent it, how much of its locked content is open,
 * the door codes of pieces already unlocked, and how to sign in. A new
 * account is told how to get in for the first time.
 */
export type GiftEmailInput = {
  to: string;
  recipientName: string | null;
  senderName: string;
  title: string;
  coverUrl: string;
  tokenId: string;
  link: string;
  newAccount: boolean;
  /** Locked pieces on this copy: how many are open, of how many */
  locked: { unlocked: number; total: number };
  /** Door codes of pieces already unlocked */
  codes: { label: string; code: string }[];
};

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function giftEmail(input: GiftEmailInput): EmailMessage {
  const hello = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
  const what = `${input.title} #${input.tokenId}`;
  const signIn = input.newAccount
    ? `We made a Bandcoin account for ${input.to} to hold it. Sign in with Google or Apple using this email, or choose "Forgot password" to set a password.`
    : `Sign in to Bandcoin with ${input.to} to see it.`;
  const progress =
    input.locked.total > 0
      ? `${input.locked.unlocked} of ${input.locked.total} locked pieces are unlocked. Visit its places on the map to unlock the rest.`
      : null;
  const codes = input.codes.map((entry) => `${entry.label}: ${entry.code}`);

  const text = [
    hello,
    "",
    `${input.senderName} sent you ${what} on Bandcoin.`,
    "",
    ...(progress ? [progress, ""] : []),
    ...(codes.length > 0 ? ["Door codes:", ...codes, ""] : []),
    signIn,
    "",
    `See it: ${input.link}`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#111">
<p>${escape(hello)}</p>
<p><b>${escape(input.senderName)}</b> sent you <b>${escape(what)}</b> on Bandcoin.</p>
<img src="${escape(input.coverUrl)}" alt="" width="240" style="border-radius:12px;display:block;margin:16px 0" />
${progress ? `<p>${escape(progress)}</p>` : ""}
${
  codes.length > 0
    ? `<p>Door codes:</p><ul>${input.codes
        .map((entry) => `<li>${escape(entry.label)}: <b>${escape(entry.code)}</b></li>`)
        .join("")}</ul>`
    : ""
}
<p>${escape(signIn)}</p>
<p><a href="${escape(input.link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">See it on Bandcoin</a></p>
</div>`;

  return { to: input.to, subject: `${input.senderName} sent you ${what}`, text, html };
}

/** Emails the recipient of a delivered NFT gift. Never throws: a failed email doesn't undo the gift. */
export async function notifyNftGift(
  ctx: Pick<Context, "db" | "chain">,
  gift: NftGiftDetails,
): Promise<void> {
  try {
    const [recipient, sender, item] = await Promise.all([
      ctx.db.user.findUnique({
        where: { id: gift.recipientId },
        select: { email: true, displayName: true, username: true },
      }),
      ctx.db.user.findUnique({
        where: { id: gift.senderId },
        select: { displayName: true, username: true, artist: { select: { name: true } } },
      }),
      ctx.db.item.findUnique({
        where: { id: gift.itemId },
        select: { title: true, coverUrl: true, slug: true },
      }),
    ]);
    if (!recipient?.email || !item) return;
    const copy = (await lockedForOwner(ctx.db, gift.recipientId, gift.itemId)).copies.find(
      (entry) => entry.tokenId === gift.tokenId,
    );
    const pieces = copy?.pieces ?? [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bandcoin.io";
    const message = giftEmail({
      to: recipient.email,
      recipientName: recipient.displayName ?? recipient.username,
      senderName:
        sender?.artist?.name ?? sender?.displayName ?? sender?.username ?? "An artist on Bandcoin",
      title: item.title,
      coverUrl: item.coverUrl,
      tokenId: gift.tokenId,
      link: `${appUrl}/item/${item.slug}`,
      newAccount: gift.newAccount,
      locked: {
        unlocked: pieces.filter((piece) => piece.required > 0 && piece.unlocked).length,
        total: pieces.filter((piece) => piece.required > 0).length,
      },
      codes: pieces.flatMap((piece) =>
        piece.code ? [{ label: piece.label ?? "Locked content", code: piece.code.code }] : [],
      ),
    });
    if (!(await ctx.chain.sendEmail(message)))
      console.info("[gift] email isn't set up; no gift email sent", { itemId: gift.itemId });
  } catch (error) {
    console.error("[gift] gift email failed; not retried", { itemId: gift.itemId, error });
  }
}
