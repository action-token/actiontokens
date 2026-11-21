import { deleteFirebaseUserByEmail } from "@actiontokens/wallet/server";
import { Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";

/**
 * Deleting your own account (the app stores require it). It removes the person
 * and what hangs off them (follows, likes, comments, notifications, collected
 * posts and pins) and their sign-in. It refuses, in plain words, when deleting
 * would lose something that matters:
 *
 *   - an admin (another admin removes them),
 *   - an artist (their items, tokens and sales need Action Tokens support),
 *   - a payment still going through,
 *   - an Action Tokens-held (email, Google, Apple) wallet that still holds tokens or
 *     more than a little XLM: Action Tokens holds its key, so deleting would lock
 *     the money away for good. Self-custody wallets keep their own key.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

export const CONFIRM_WORD = "DELETE";
/** XLM an Action Tokens-held wallet may still hold: its reserve and a little change. */
const DUST_XLM = 2;
const SUPPORT = "Email support@action-tokens.com and we'll help.";

const refuse = (message: string) => new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message });

export async function deleteAccount(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { confirm: string },
  deps: { deleteSignIn?: (email: string) => Promise<boolean> } = {},
) {
  if (input.confirm !== CONFIRM_WORD)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Type ${CONFIRM_WORD} to confirm.`,
    });

  const row = await ctx.db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      role: true,
      email: true,
      walletAddress: true,
      organization: { select: { id: true } },
    },
  });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Account not found" });
  if (row.role === "ADMIN")
    throw refuse(
      "Admins can't delete themselves. Ask another admin to remove your admin access first.",
    );
  if (row.organization)
    throw refuse(
      `Artist accounts have items, tokens and sales attached, so Action Tokens support removes them. ${SUPPORT}`,
    );

  const inFlight = await ctx.db.order.count({
    where: { buyerId: row.id, status: { in: ["AWAITING_SIGNATURE", "SUBMITTED", "CONFIRMED"] } },
  });
  if (inFlight > 0) throw refuse("A payment is still going through. Try again in a few minutes.");

  if (isCustodial(user) && row.walletAddress) {
    const account = await ctx.chain.loadAccount(row.walletAddress).catch(() => null);
    const lines = account?.balances ?? [];
    const holdsTokens = lines.some(
      (line) => line.asset_type !== "native" && Number(line.balance) > 0,
    );
    const xlm = Number(lines.find((line) => line.asset_type === "native")?.balance ?? 0);
    if (holdsTokens || xlm > DUST_XLM)
      throw refuse(
        `Action Tokens holds the key to your wallet, and it still holds funds. Deleting would lock them away for good. ${SUPPORT}`,
      );
  }

  try {
    await ctx.db.user.delete({ where: { id: row.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
      throw refuse(`Some of your records can't be removed automatically. ${SUPPORT}`);
    throw error;
  }
  ctx.activity.set({ targetType: "User", targetId: row.id });

  // Their sign-in goes too, so the email can start fresh. Best effort: the account itself is already gone.
  if (row.email) {
    try {
      await (deps.deleteSignIn ?? deleteFirebaseUserByEmail)(row.email);
    } catch (error) {
      console.error("[account] couldn't remove the sign-in", error);
    }
  }
  return { deleted: true as const };
}
