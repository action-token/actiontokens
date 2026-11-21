"use client";

import { ExternalLink, Gift, Link2, Lock, MapPin, Play } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";

import { api, type RouterOutputs } from "~/trpc/react";

import { AR_URL } from "../shell/nav";
import {
  KIND,
  labelOf,
  type Preview,
  radiusOf,
  RewardTiles,
  summaryOf,
  travelOf,
  UnlockPlaces,
} from "./locked-preview";

type OwnedPiece = RouterOutputs["item"]["lockedForMe"]["copies"][number]["pieces"][number];

/**
 * A contract NFT's locked content on its page, in the old Action Tokens' style.
 * Everyone sees what they get and where it unlocks; owners see each copy's
 * rewards, locked with their progress or open to play. Links only ever come
 * from the owner query.
 */
export function LockedContent({
  itemId,
  pieces,
  owned,
  network,
}: {
  itemId: string;
  pieces: Preview[];
  owned: boolean;
  /** "mainnet" or "testnet", for the transaction link */
  network: string;
}) {
  const { status } = useSession();
  const mine = api.item.lockedForMe.useQuery(
    { itemId },
    { enabled: owned && status === "authenticated" },
  );
  if (pieces.length === 0) return null;
  const { places } = travelOf(pieces);
  const radius = radiusOf(pieces);

  return (
    <div className="grid gap-4">
      <section className="bg-surface grid content-start gap-3 rounded-[1.2rem] border-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-fg-muted flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <Gift className="size-3.5" />
            {owned ? "Your rewards" : "What you get"}
          </h2>
          <span className="text-fg-muted text-xs">{summaryOf(pieces)}</span>
        </div>

        {!owned ? (
          <RewardTiles pieces={pieces} />
        ) : mine.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : mine.data && mine.data.copies.length > 0 ? (
          mine.data.copies.map((copy) => (
            <div key={copy.tokenId} className="grid gap-2">
              {mine.data.copies.length > 1 && (
                <p className="text-fg-muted text-xs font-semibold">Copy #{copy.tokenId}</p>
              )}
              {copy.pieces.map((piece, index) => (
                <RewardRow key={piece.id} piece={piece} index={index} network={network} />
              ))}
            </div>
          ))
        ) : (
          <RewardTiles pieces={pieces} />
        )}

        {owned && places > 0 && (
          <Button asChild size="sm" variant="outline" className="justify-self-start">
            <a href={AR_URL} target="_blank" rel="noreferrer">
              <MapPin /> Collect places in the AR app
            </a>
          </Button>
        )}
      </section>

      {places > 0 && (
        <section
          id="unlock-places"
          className="bg-surface grid scroll-mt-24 content-start gap-3 rounded-[1.2rem] border-2 p-4 sm:p-5"
        >
          <h2 className="text-fg-muted flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <MapPin className="size-3.5" /> Where to unlock
          </h2>
          <UnlockPlaces pieces={pieces} radius={radius} />
        </section>
      )}
    </div>
  );
}

/**
 * One reward on a copy you own. Locked: a dashed row with its progress, nothing
 * to open. Unlocked: a green row that opens it (and its door code, if any).
 */
function RewardRow({
  piece,
  index,
  network,
}: {
  piece: OwnedPiece;
  index: number;
  network: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = KIND[piece.type];
  const label = labelOf(piece.type, piece.label, index);

  if (!piece.unlocked || !piece.url) {
    const progress = piece.required > 0 ? Math.round((piece.visited / piece.required) * 100) : 0;
    return (
      <div className="text-fg-muted bg-surface-2/40 grid gap-2 rounded-lg border border-dashed px-4 py-3">
        <div className="flex items-center gap-3">
          <kind.icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
          {piece.required > 0 && (
            <span className="num shrink-0 text-xs">
              {piece.visited} of {piece.required} places
            </span>
          )}
          <Lock className="size-4 shrink-0" />
        </div>
        {piece.required > 0 && (
          <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full" aria-hidden>
            <div className="h-full bg-amber-500" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    );
  }

  const url = piece.url;
  return (
    <div className="grid gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
      {piece.type === "OTHER" ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 text-left"
        >
          <kind.icon className="size-4 shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
          <Link2 className="size-4 shrink-0 text-emerald-500" />
        </a>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-3 text-left"
        >
          <kind.icon className="size-4 shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
          <Play className="size-4 shrink-0 text-emerald-500" />
        </button>
      )}
      {open && <Content type={piece.type} url={url} />}
      {(piece.code || piece.onChain?.txHash) && (
        <div className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {piece.code && (
            <span>
              Door code{" "}
              <span className="text-fg font-mono font-semibold tracking-widest">
                {piece.code.code}
              </span>
              {piece.code.redeemedAt ? " · redeemed" : " · show it to the artist to redeem"}
            </span>
          )}
          {piece.onChain?.txHash && (
            <a
              href={`https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/tx/${piece.onChain.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-fg inline-flex items-center gap-1"
            >
              Recorded on Stellar <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Content({ type, url }: { type: OwnedPiece["type"]; url: string }) {
  if (type === "SONG")
    return <audio controls autoPlay preload="none" src={url} className="w-full" />;
  if (type === "VIDEO")
    return <video controls autoPlay preload="metadata" src={url} className="w-full rounded-lg" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="max-h-80 rounded-lg object-contain" />
    </a>
  );
}
