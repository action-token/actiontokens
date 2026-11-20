import type { Copier, Row } from "./copier";
import { dec, json } from "./map";

/** Wallets already paid are stored as a Postgres text[]; Actionverse kept them in a JSON array. */
const wallets = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * Holder rewards. Rounds carry over exactly, paid ones included (who was paid is what stops a
 * round being paid twice). The Trigger.dev run handle is dropped: the worker tracks payment jobs.
 * Amounts that were floats become exact decimals.
 */
export async function copyRewards(copy: Copier) {
  await copy.insert(
    "origin_rewards",
    (await copy.read("OriginReward")).map((row: Row) => ({
      id: copy.map("OriginReward", row.id, true),
      monthYear: row.monthYear,
      data: json(row.data) ?? "[]",
      totalBalance: dec(row.totalBalance) ?? "0",
      isDistributed: row.isDistributed,
      distributedAmount: row.distributedAmount == null ? null : dec(row.distributedAmount),
      lastUpdatedAt: row.lastUpdatedAt,
      rewardedAt: row.rewardedAt,
      completedUsers: wallets(row.completedUsers),
      lastError: json(row.lastError),
    })),
  );
  await copy.insert(
    "quarter_rewards",
    (await copy.read("QuarterReward")).map((row: Row) => ({
      id: copy.map("QuarterReward", row.id, true),
      year: row.year,
      quarter: row.quarter,
      data: json(row.data) ?? "[]",
      isDistributed: row.isDistributed,
      distributedAmount: row.distributedAmount == null ? null : dec(row.distributedAmount),
      lastUpdatedAt: row.lastUpdatedAt,
      rewardedAt: row.rewardedAt,
      completedUsers: wallets(row.completedUsers),
      lastError: json(row.lastError),
    })),
  );
  for (const [from, to, key] of [
    ["OriginBlockedUser", "origin_blocked_users", "origin"],
    ["QuarterBlockedUser", "quarter_blocked_users", "quarter"],
  ] as const)
    await copy.insert(
      to,
      (await copy.read(from)).map((row: Row) => ({
        id: copy.map(`${key}Blocked`, row.id, true),
        walletAddress: row.walletAddress,
        reason: row.reason,
        blockedAt: row.blockedAt,
      })),
    );
}

/** The Telegram bot and channel, switched exactly as they were. */
export async function copyTelegram(copy: Copier) {
  await copy.insert(
    "telegram_config",
    (await copy.read("TelegramConfig")).map((row: Row) => ({
      id: copy.map("TelegramConfig", row.id),
      botToken: row.botToken,
      chatId: row.chatId,
      enabled: row.enabled,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy ? copy.find("User", row.updatedBy) : null,
    })),
  );
}
