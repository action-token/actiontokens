import type { Copier, Row } from "./copier";
import {
  creditsToCoins,
  dec,
  finishedJobStatus,
  generationFromResult,
  json,
  newId,
  prize,
} from "./map";

/** Bounties keep their ids and their escrow, untouched. */
export async function copyBounties(copy: Copier) {
  await copy.insert(
    "bounties",
    (await copy.read("Bounty")).map((bounty: Row) => ({
      id: copy.map("Bounty", bounty.id, true),
      artistId: copy.must("Creator", bounty.creatorId),
      title: bounty.title,
      summary: bounty.summary,
      description: bounty.description,
      instructions: bounty.instructions ?? [],
      ...prize(bounty.prizeAssetCode, bounty.prizeAssetIssuer),
      prizeAmount: dec(bounty.prizeAmount),
      rewardNote: bounty.rewardNote,
      maxWinners: bounty.maxWinners,
      status: bounty.status,
      escrowContractId: bounty.escrowContractId,
      fundTxHash: bounty.txHash,
      fundedFromStorage: bounty.fundedFromCreatorStorage,
      requiresActionCam: bounty.requiresActionCam,
      createdAt: bounty.createdAt,
      updatedAt: bounty.updatedAt,
    })),
  );
  await copy.insert(
    "bounty_participants",
    (await copy.read("BountyParticipant")).map((row: Row) => ({
      id: copy.map("BountyParticipant", row.id),
      bountyId: copy.must("Bounty", row.bountyId),
      userId: copy.must("User", row.userId),
      joinedAt: row.joinedAt,
    })),
  );
  await copy.insert(
    "bounty_submissions",
    (await copy.read("BountySubmission")).map((row: Row) => ({
      id: copy.map("BountySubmission", row.id),
      bountyId: copy.must("Bounty", row.bountyId),
      userId: copy.must("User", row.userId),
      body: row.content,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
  await copy.insert(
    "bounty_winners",
    (await copy.read("BountyWinner")).map((row: Row) => ({
      id: copy.map("BountyWinner", row.id),
      bountyId: copy.must("Bounty", row.bountyId),
      userId: copy.must("User", row.userId),
      prizeAmount: dec(row.prizeAmount),
      txHash: row.txHash,
      claimedAt: row.claimedAt,
      selectedAt: row.selectedAt,
    })),
  );
  const configs = await copy.read("BountyMusicConfig");
  await copy.insert(
    "bounty_music_rules",
    configs.map((config: Row) => ({
      bountyId: copy.must("Bounty", config.bountyId),
      mode: config.musicMode,
      ruleType: config.ruleType,
      requiredTracks: config.customRequiredTracks,
      totalPlays: config.customTotalPlays,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    })),
  );
  const bountyOf = new Map(
    configs.map((config) => [config.id as string, config.bountyId as string]),
  );
  await copy.insert(
    "bounty_tracks",
    (await copy.read("BountyTrack")).map((track: Row) => ({
      id: track.id,
      bountyId: copy.must("Bounty", bountyOf.get(track.musicConfigId)),
      title: track.title,
      artistName: track.artist,
      albumName: track.album,
      albumArtUrl: track.albumArtUrl,
      durationSec: track.durationSec,
      targetPlays: track.targetPlayCount,
      lastFmUrl: track.lastFmUrl,
      spotifyUrl: track.spotifyUrl,
      youtubeUrl: track.youtubeUrl,
      createdAt: track.createdAt,
    })),
  );
}

export async function copyStudio(copy: Copier) {
  const now = new Date();
  const balances = await copy.read("CreditBalance");
  await copy.insert(
    "studio_balances",
    balances.map((row: Row) => ({
      userId: copy.must("User", row.userId),
      balance: dec(creditsToCoins(row.balance)),
      updatedAt: now,
    })),
  );
  await copy.insert(
    "studio_ledger_entries",
    balances
      .filter((row) => creditsToCoins(row.balance) > 0)
      .map((row: Row) => ({
        id: newId(),
        userId: copy.must("User", row.userId),
        kind: "MIGRATED",
        status: "CONFIRMED",
        amount: dec(creditsToCoins(row.balance)),
        note: `${row.balance} credits from the old app, at $1 a credit`,
        createdAt: now,
      })),
  );

  await copy.insert(
    "generations",
    (await copy.read("GenerationJob")).map((job: Row) => {
      const { type, outputs } = generationFromResult(job.result);
      return {
        id: job.id,
        userId: copy.must("User", job.userId),
        type,
        prompt: "(made in the old app)",
        status: finishedJobStatus(job.status),
        progress: job.progress,
        message: job.message,
        cost: dec(0),
        outputs: json(outputs),
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    }),
  );
  await copy.insert(
    "generations",
    (await copy.read("AiGeneratedContent")).map((row: Row) => ({
      id: copy.map("AiGeneratedContent", row.id),
      userId: copy.must("User", row.creatorId),
      artistId: copy.find("Creator", row.creatorId),
      type: row.contentType === "MUSIC" ? "MUSIC" : row.contentType === "VIDEO" ? "VIDEO" : "IMAGE",
      prompt: row.prompt,
      model: row.model,
      status: "SUCCEEDED",
      cost: dec(creditsToCoins(row.creditsUsed ?? 0)),
      tokensUsed: row.tokensUsed,
      outputs: json([
        {
          type:
            row.contentType === "MUSIC" ? "audio" : row.contentType === "VIDEO" ? "video" : "image",
          url: row.contentUrl,
          mimeType: null,
        },
      ]),
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    })),
  );

  await copy.insert(
    "agent_jobs",
    (await copy.read("AgentJob")).map((job: Row) => ({
      id: job.id,
      artistId: copy.must("Creator", job.creatorId),
      status: finishedJobStatus(job.status),
      payload: json(job.payload),
      result: json(job.result),
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })),
  );
  await copy.insert(
    "agent_conversations",
    (await copy.read("AgentConversation")).map((row: Row) => ({
      id: copy.map("AgentConversation", row.id, true),
      artistId: copy.must("Creator", row.creatorId),
      userId: copy.must("User", row.userId),
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
  await copy.insert(
    "agent_messages",
    (await copy.read("AgentMessage")).map((row: Row) => ({
      id: row.id,
      conversationId: copy.must("AgentConversation", row.conversationId),
      role: row.role,
      text: row.text,
      blocks: json(row.blocks),
      steps: json(row.steps),
      createdAt: row.createdAt,
    })),
  );
  await copy.insert(
    "agent_actions",
    (await copy.read("AgentAction")).map((row: Row) => ({
      id: row.id,
      conversationId: copy.must("AgentConversation", row.conversationId),
      artistId: copy.must("Creator", row.creatorId),
      type: row.type,
      payload: json(row.payload),
      status: row.status,
      result: json(row.result),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
}
