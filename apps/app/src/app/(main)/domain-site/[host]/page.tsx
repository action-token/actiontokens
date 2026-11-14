import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ArtistView, artistMetadata } from "~/features/artist-page/artist-view";
import { serverApi } from "~/server/api";

type Props = { params: Promise<{ host: string }> };

/** The artist a LIVE custom domain shows; anything else is a 404. */
const resolve = cache(async (raw: string) => {
  let host = "";
  try {
    host = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return (await serverApi()).artist.byDomain({ host });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await resolve((await params).host);
  if (!site) return {};
  return {
    ...(await artistMetadata(site.slug)),
    alternates: { canonical: `https://${site.domain}/` },
  };
}

/**
 * An artist's own domain (plan 32). proxy.ts rewrites the domain's home here;
 * it shows the same artist page as /artist/[slug] and the short link.
 */
export default async function DomainSitePage({ params }: Props) {
  const site = await resolve((await params).host);
  if (!site) notFound();
  return <ArtistView slug={site.slug} />;
}
