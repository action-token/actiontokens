import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { normalizeVanityName, validateVanityName } from "@bandcoin/utils/vanity";

import { ArtistView, artistMetadata } from "~/features/artist-page/artist-view";
import { serverApi } from "~/server/api";

type Props = { params: Promise<{ vanity: string }> };

/** "/%40luna" is "/@luna"; a broken escape is just an unknown name. */
function safeDecode(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return "";
  }
}

/** The artist behind bandcoin.io/name; names that couldn't be a link never reach the database. */
const resolve = cache(async (raw: string) => {
  const name = normalizeVanityName(safeDecode(raw));
  if (validateVanityName(name)) return null;
  return (await serverApi()).artist.byVanity({ name });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const link = await resolve((await params).vanity);
  if (!link?.works) return {};
  return {
    ...(await artistMetadata(link.slug)),
    alternates: { canonical: `/${(await params).vanity}` },
  };
}

/**
 * An artist's short link. While it is paid (or in its 7 grace days) it shows the
 * artist's page at this address; once lapsed it sends visitors to the normal
 * page, and an unknown name is a 404.
 */
export default async function VanityPage({ params }: Props) {
  const link = await resolve((await params).vanity);
  if (!link) notFound();
  if (!link.works) redirect(`/artist/${link.slug}`);
  return <ArtistView slug={link.slug} />;
}
