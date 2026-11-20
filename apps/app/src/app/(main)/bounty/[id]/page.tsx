import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { isAppError } from "@actiontokens/errors";

import { BountyView } from "~/features/bounty/bounty-view";
import { serverApi } from "~/server/api";

const loadBounty = cache(async (bountyId: string) => {
  try {
    return await (await serverApi()).bounty.byId({ bountyId });
  } catch (error) {
    if (
      (isAppError(error) && error.code === "RESOURCE_NOT_FOUND") ||
      (error instanceof Error && error.message === "This bounty doesn't exist.")
    ) {
      notFound();
    }
    throw error;
  }
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bounty = await loadBounty((await params).id);
  return {
    title: bounty.title,
    description: `${bounty.summary} A bounty from ${bounty.artist.name} on Bandcoin.`,
  };
}

export default async function BountyPage({ params }: Props) {
  return <BountyView initial={await loadBounty((await params).id)} />;
}
