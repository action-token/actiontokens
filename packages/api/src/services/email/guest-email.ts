import type { Context } from "../../context";
import { escape } from "./gift-email";
import type { EmailMessage } from "./mailer";

/**
 * What a guest buyer gets once their order is delivered: what they bought and
 * how to reach the account it went to. The success screen says the same, but
 * this one is still there after the tab is closed.
 */
export type GuestPurchaseEmailInput = {
  to: string;
  title: string;
  quantity: number;
  coverUrl: string;
  link: string;
};

export function guestPurchaseEmail(input: GuestPurchaseEmailInput): EmailMessage {
  const what = input.quantity > 1 ? `${input.quantity} × ${input.title}` : input.title;
  const where = `It's in the Action Tokens account for ${input.to}.`;
  const signIn = `To open it, sign in with Google or Apple using this email, or choose "Forgot password" to set a password.`;

  const text = [
    "Hi,",
    "",
    `Thanks for buying ${what} on Action Tokens.`,
    "",
    where,
    signIn,
    "",
    `See it: ${input.link}`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#111">
<p>Hi,</p>
<p>Thanks for buying <b>${escape(what)}</b> on Action Tokens.</p>
<img src="${escape(input.coverUrl)}" alt="" width="240" style="border-radius:12px;display:block;margin:16px 0" />
<p>${escape(where)}</p>
<p>${escape(signIn)}</p>
<p><a href="${escape(input.link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">See it on Action Tokens</a></p>
</div>`;

  return { to: input.to, subject: `Your Action Tokens purchase: ${what}`, text, html };
}

/** Emails a guest buyer after delivery. Never throws: a failed email doesn't undo the purchase. */
export async function notifyGuestPurchase(
  ctx: Pick<Context, "db" | "chain">,
  order: { guestEmail: string; itemId: string | null; quantity: number },
): Promise<void> {
  try {
    if (!order.itemId) return;
    const item = await ctx.db.item.findUnique({
      where: { id: order.itemId },
      select: { title: true, coverUrl: true, slug: true },
    });
    if (!item) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.action-tokens.com";
    const sent = await ctx.chain.sendEmail(
      guestPurchaseEmail({
        to: order.guestEmail,
        title: item.title,
        quantity: order.quantity,
        coverUrl: item.coverUrl,
        link: `${appUrl}/item/${item.slug}`,
      }),
    );
    if (!sent)
      console.info("[guest] email isn't set up; no purchase email sent", { itemId: order.itemId });
  } catch (error) {
    console.error("[guest] purchase email failed; not retried", { itemId: order.itemId, error });
  }
}
