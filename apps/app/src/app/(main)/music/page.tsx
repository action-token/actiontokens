import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ tab?: string }> };

/** Music now lives on Home; "Your items" moved to My collection → Songs. Old links still land. */
export default async function MusicPage({ searchParams }: Props) {
  redirect((await searchParams).tab === "mine" ? "/collection?tab=songs" : "/");
}
