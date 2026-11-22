"use client";

import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { ScrollHero } from "@actiontokens/ui/patterns/scroll-hero";

import { api, type RouterOutputs } from "~/trpc/react";

import { OrgCircle } from "../artists/artists-view";
import { BountyCard } from "../bounty/bounty-card";
import { CommunityCard } from "../community/parts";
import { ItemCard } from "../catalog/item-card";
import {} from "../shell/nav";
import { HomeFooter } from "./home-footer";
import { useHomeFeed } from "./home-feed";
import { anton, gothic } from "./landing-fonts";

type Home = RouterOutputs["catalog"]["home"];

const HERO_LINES = [
  { from: 0, top: "Take", bottom: "Action." },
  { from: 60, top: "Earn", bottom: "Tokens." },
  { from: 118, top: "Prove it.", bottom: "Own it." },
];

const RIBBON = [
  "Live bounties",
  "New drops",
  "Claim pins IRL",
  "Prizes in escrow",
  "Fan tokens",
  "ACTION on Stellar",
];

/**
 * The marketplace's front page, after docs/mockups/home.html: the scroll-played hero, the neon
 * ribbon, then Live drops, the Bounties board, Organizations, Crews and the two ways out (the
 * gallery and the AR map). Every number is real; sections with nothing to show are left out.
 * Light on the GPU: transforms and opacity only, nothing moving at rest but the ribbon.
 */
export function HomeFront({ home, children }: { home: Home; children?: ReactNode }) {
  const root = useReveal<HTMLDivElement>();
  const drops = useShelf("drops", home.drops, home.more.drops);
  const bounties = useShelf("bounties", home.bounties, home.more.bounties);
  const orgs = useShelf("artists", home.artists, home.more.artists);
  useHeroMode(root);
  useHomeFeed(home);
  return (
    <div ref={root} className={cn(anton.variable, gothic.variable, "hm")}>
      <ScrollHero
        label="Action Tokens marketplace"
        kicker="Live on Stellar"
        lines={HERO_LINES}
        facts={[
          ["Drops", "collect limited editions"],
          ["Bounties", "prizes held in escrow"],
          ["AR", "claim pins out there"],
          ["ACTION", "earn it, spend it"],
        ]}
        ctas={
          <>
            <Link href="/marketplace" className="lph-btn lph-btn--neon">
              Explore drops <ArrowRight className="size-4" />
            </Link>
            <Link href="/bounties" className="lph-btn lph-btn--chrome">
              Hunt bounties
            </Link>
          </>
        }
      />
      <div className="lp-marquee-box" aria-hidden>
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...RIBBON, ...RIBBON].map((word, index) => (
              <span key={index}>{word}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="hm-body">
        {home.drops.length > 0 && (
          <Section
            tag="Fresh off the block"
            title="Live drops"
            note="Limited editions from organizations on Action Tokens. Collect, flex, resell."
            more={{ href: "/marketplace", label: "See all drops" }}
            pager={drops}
          >
            <div ref={drops.rowRef} className="hm-shelf hm-shelf--drops">
              {drops.items.map((drop) => (
                <ItemCard key={drop.id} item={drop} queue={drops.items} />
              ))}
            </div>
          </Section>
        )}

        {home.bounties.length > 0 && (
          <Section
            tag="The board"
            title="Bounties"
            note="Every prize sits in escrow on-chain before the hunt starts. Do the thing, prove it, get paid."
            more={{ href: "/bounties", label: "Full board" }}
            pager={bounties}
          >
            <div ref={bounties.rowRef} className="hm-shelf hm-shelf--board">
              {bounties.items.map((bounty) => (
                <BountyCard key={bounty.id} bounty={bounty} />
              ))}
            </div>
          </Section>
        )}

        {home.artists.length > 0 && (
          <Section
            tag="Who's dropping"
            title="Organizations"
            more={{ href: "/artists", label: "All orgs" }}
            pager={orgs}
          >
            <div ref={orgs.rowRef} className="hm-shelf hm-shelf--orgs">
              {orgs.items.map((org) => (
                <OrgCircle
                  key={org.slug}
                  artist={{ ...org, songs: org.items, tokenCode: org.token?.code ?? null }}
                />
              ))}
            </div>
          </Section>
        )}

        <Crews />

        {children}
      </div>
      <HomeFooter home={home} />
    </div>
  );
}

function Section({
  tag,
  title,
  note,
  more,
  pager,
  children,
}: {
  tag: string;
  title: string;
  note?: string;
  more?: { href: string; label: string };
  pager?: Pager;
  children: ReactNode;
}) {
  return (
    <section className="hm-sec" data-reveal>
      <div className="hm-head">
        <div className="min-w-0">
          <p className="lp-tag">{tag}</p>
          <h2 className="lp-sec-title lp-chrome">{title}</h2>
          {note && <p className="text-fg-muted mt-2 max-w-md text-[15px]">{note}</p>}
        </div>
        <div className="hm-head-end">
          {more && (
            <Link href={more.href} className="hm-more">
              {more.label} →
            </Link>
          )}
          {pager && (
            <div className="hm-pager" role="group" aria-label={`${title} pages`}>
              <button
                type="button"
                onClick={pager.prev}
                disabled={pager.atStart}
                aria-label="Previous"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={pager.next} disabled={pager.atEnd} aria-label="Next">
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

type Shelf = "drops" | "bounties" | "artists";
type Pager = {
  rowRef: React.RefObject<HTMLDivElement | null>;
  atStart: boolean;
  atEnd: boolean;
  busy: boolean;
  prev: () => void;
  next: () => void;
};

/**
 * One home shelf: a row showing as many cards as fit; the arrows slide it one screenful either way.
 * The first 10 come with the home data; when the row gets within a screenful of its end the next 10
 * are fetched (`catalog.shelf`) and added on, so Next keeps going until the shelf runs out.
 */
function useShelf<K extends Shelf>(
  shelf: K,
  first: Home[K],
  firstHasMore: boolean,
): Pager & { items: Home[K] } {
  const utils = api.useUtils();
  const rowRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Home[K]>(first);
  const [hasMore, setHasMore] = useState(firstHasMore);
  const [busy, setBusy] = useState(false);
  const [edges, setEdges] = useState({ atStart: true, atEnd: !firstHasMore });
  // batches loaded so far and the one in flight, kept in refs so two scroll events (or a re-run
  // effect) can't fetch the same batch twice
  const loaded = useRef(1);
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (!hasMore || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const batch = await utils.catalog.shelf.fetch({ shelf, page: loaded.current });
      loaded.current += 1;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...batch.items.filter((item) => !seen.has(item.id))] as Home[K];
      });
      setHasMore(batch.hasMore);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [utils, shelf, hasMore]);

  // which arrows apply, and fetching the next batch as the row nears its end
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let raf = 0;
    // only after the visitor slides: the first 10 come with the page, nothing more is fetched on load
    let moved = false;
    const measure = () => {
      raf = 0;
      const left = row.scrollLeft;
      const room = row.scrollWidth - row.clientWidth;
      setEdges({ atStart: left <= 2, atEnd: left >= room - 2 && !hasMore });
      if (moved && hasMore && left + row.clientWidth * 2 >= row.scrollWidth) void loadMore();
    };
    const onScroll = (event?: Event) => {
      if (event?.type === "scroll") moved = true;
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    if (row.scrollLeft > 2) moved = true;
    row.addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      row.removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [hasMore, loadMore, items.length]);

  const slide = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    row.scrollBy({ left: direction * (row.clientWidth + gap), behavior: "smooth" });
  };
  return { items, rowRef, busy, ...edges, prev: () => slide(-1), next: () => slide(1) };
}

/** Crews: the biggest token-gated communities, each saying what it takes to get in. */
function Crews() {
  const crews = api.community.trending.useQuery({ limit: 4 });
  if (!crews.data?.length) return null;
  return (
    <Section
      tag="Run with a crew"
      title="Crews"
      note="Token-gated communities. Hold the token, get in the room."
      more={{ href: "/communities", label: "All crews" }}
    >
      <div className="cm-grid">
        {crews.data.map((crew) => (
          <CommunityCard key={crew.id} community={crew} />
        ))}
      </div>
    </Section>
  );
}

/**
 * While the hero fills the screen the page is all hero: the sidebar slides away and the hero and
 * the notch use the full width. Past the hero (with a third of a screen to spare, as in the
 * mockup) the sidebar slides back in. The sections below are laid out for the sidebar all along,
 * so nothing reflows. Sets `data-hero` on <html>; styles in home.css.
 */
function useHeroMode(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const html = document.documentElement;
    const hero = root.current?.querySelector<HTMLElement>(".lph");
    if (!hero) return;
    let raf = 0;
    let on: boolean | null = null;
    const update = () => {
      raf = 0;
      const rect = hero.getBoundingClientRect();
      // still inside the hero until its end is within a third of a screen of the bottom edge
      const next = rect.bottom > innerHeight * 1.35;
      if (next === on) return;
      on = next;
      html.toggleAttribute("data-hero", next);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      html.removeAttribute("data-hero");
    };
  }, [root]);
}

/** Marks each `[data-reveal]` inside the returned ref with `data-in` once it reaches the screen. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-in", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    const watched = new WeakSet<Element>();
    const watch = () =>
      root.querySelectorAll<HTMLElement>("[data-reveal]:not([data-in])").forEach((item) => {
        if (watched.has(item)) return;
        watched.add(item);
        observer.observe(item);
      });
    watch();
    // Sections that load after the page (Crews) are watched when they appear.
    const added = new MutationObserver(watch);
    added.observe(root, { childList: true, subtree: true });
    return () => {
      added.disconnect();
      observer.disconnect();
    };
  }, []);
  return ref;
}
