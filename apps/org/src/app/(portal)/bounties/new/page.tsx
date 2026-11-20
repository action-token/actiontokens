import { NewBountyView } from "~/features/bounties/bounty-pages";

export const metadata = { title: "New bounty" };

/** `?type=music` or `?type=general` comes from the "New bounty" menu. */
export default async function NewBountyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  return <NewBountyView kind={type === "music" || type === "general" ? type : undefined} />;
}
