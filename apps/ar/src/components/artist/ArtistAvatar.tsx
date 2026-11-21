import { useEffect, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { site } from "@actiontokens/ar-core/site";

/** The stand-in when an artist's picture can't load: the Action Tokens mark, shipped with the app. */
const FALLBACK_SRC = site.assets.mark;

/**
 * ── ArtistAvatar ───────────────────────────────────────────────────────────
 *
 * An artist's picture, falling back to the Action Tokens mark when the URL doesn't
 * load. Old uploads sit on several hosts, and public IPFS gateways rate-limit
 * and then block, so a dead URL must degrade to the mark instead of a broken
 * image glyph.
 */
export function ArtistAvatar({
  src,
  alt = "",
  className,
  loading = "lazy",
  onLoad,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  /**
   * Fires for the fallback too, not just the real image — `HoloCard` gates its
   * reveal on this, and an artist with a dead URL should still finish loading.
   */
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  // A list that recycles this component across artists would otherwise carry
  // one artist's failure onto the next one's image.
  useEffect(() => setFailed(false), [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed || !src ? FALLBACK_SRC : src}
      alt={alt}
      onError={() => setFailed(true)}
      onLoad={onLoad}
      loading={loading}
      decoding="async"
      className={cn("object-cover", className)}
    />
  );
}
