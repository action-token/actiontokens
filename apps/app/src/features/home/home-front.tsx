"use client";

import { ArrowRight, BadgeCheck, Compass, Crosshair, ScanLine, Users } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { ScrollHero } from "@actiontokens/ui/patterns/scroll-hero";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { FollowButton } from "../artist/follow-button";
import { AR_URL } from "../shell/nav";
import { HomeNotch } from "./home-notch";
import { anton, gothic } from "./landing-fonts";

type Home = RouterOutputs["catalog"]["home"];
type Drop = Home["drops"][number];
type Org = Home["artists"][number];
type Bounty = Home["bounties"][number];
type Crew = RouterOutputs["community"]["trending"][number];

/** The gallery app, once it has an address (owner to confirm the domain). */
const GALLERY_URL = process.env.NEXT_PUBLIC_GALLERY_URL;

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
  const { status } = useSession();
  const root = useReveal<HTMLDivElement>();
  return (
    <div ref={root} className={cn(anton.variable, gothic.variable, "hm")}>
      <HomeNotch home={home} />
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
          >
            <div className="hm-rail">
              {home.drops.map((drop) => (
                <DropCard key={drop.id} drop={drop} />
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
          >
            <div className="hm-board">
              {home.bounties.map((bounty) => (
                <Poster key={bounty.id} bounty={bounty} />
              ))}
            </div>
          </Section>
        )}

        {home.artists.length > 0 && (
          <Section
            tag="Who's dropping"
            title="Organizations"
            more={{ href: "/artists", label: "All orgs" }}
          >
            <div className="hm-orgs">
              {home.artists.slice(0, 8).map((org) => (
                <OrgCard key={org.slug} org={org} signedIn={status === "authenticated"} />
              ))}
            </div>
          </Section>
        )}

        <Crews signedIn={status === "authenticated"} />

        {children}

        <Section tag="Out there" title="Explore">
          <div className={cn("hm-explore", !GALLERY_URL && "hm-explore--one")}>
            {GALLERY_URL && (
              <a href={GALLERY_URL} className="hm-way hm-way--gallery">
                <span className="hm-way-art" aria-hidden>
                  {Array.from({ length: 6 }, (_, index) => (
                    <i key={index} />
                  ))}
                </span>
                <span className="hm-way-text">
                  <span className="lp-tag">Walk it</span>
                  <span className="hm-way-title lp-chrome">Enter the gallery</span>
                  <span className="hm-way-btn hm-way-btn--ghost">
                    Open the gallery <Compass className="size-4" />
                  </span>
                </span>
              </a>
            )}
            <a href={AR_URL} className="hm-way hm-way--ar">
              <span className="hm-way-map" aria-hidden>
                <i style={{ left: "22%", top: "30%" }} />
                <i style={{ left: "64%", top: "22%" }} data-gold />
                <i style={{ left: "46%", top: "58%" }} />
                <i style={{ left: "78%", top: "64%" }} />
                <b style={{ left: "55%", top: "44%" }} />
              </span>
              <span className="hm-way-text">
                <span className="lp-tag">Touch grass</span>
                <span className="hm-way-title lp-chrome">Go out there</span>
                <span className="text-fg-muted max-w-xs text-sm">
                  Pins dropped by organizations wait on the map. Walk up, open AR, collect.
                </span>
                <span className="hm-way-btn">
                  Open AR map <ScanLine className="size-4" />
                </span>
              </span>
            </a>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  tag,
  title,
  note,
  more,
  children,
}: {
  tag: string;
  title: string;
  note?: string;
  more?: { href: string; label: string };
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
        {more && (
          <Link href={more.href} className="hm-more">
            {more.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A live drop: square art with the edition and, when the sale ends, a countdown. */
function DropCard({ drop }: { drop: Drop }) {
  const left = drop.supply != null ? Math.max(0, drop.supply - drop.sold) : null;
  return (
    <article className="hm-drop">
      <Link href={`/item/${drop.slug}`} className="hm-drop-art">
        {drop.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
          <img src={drop.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="hm-drop-blank" aria-hidden />
        )}
        <span className="hm-chip hm-chip--type">{TYPE_LABEL[drop.type] ?? drop.type}</span>
        <span className="hm-chip hm-chip--ed">
          {drop.supply != null ? `${drop.sold} / ${drop.supply} sold` : "Open edition"}
        </span>
        <span className="hm-cd">
          {drop.saleEndsAt ? (
            <>
              <span>Ends in</span>
              <Countdown to={drop.saleEndsAt} />
            </>
          ) : left === 0 ? (
            <span>Sold out</span>
          ) : (
            <>
              <span>{drop.supply == null ? "Open edition" : "Left"}</span>
              <b>{left == null ? "∞" : left}</b>
            </>
          )}
        </span>
      </Link>
      <div className="hm-drop-meta">
        {drop.artistSlug ? (
          <Link href={`/artist/${drop.artistSlug}`} className="hm-drop-org">
            <BadgeCheck className="size-3.5" /> {drop.artistName}
          </Link>
        ) : (
          <span className="hm-drop-org">
            <BadgeCheck className="size-3.5" /> {drop.artistName}
          </span>
        )}
        <h3 className="hm-drop-title">{drop.title}</h3>
        <div className="hm-drop-foot">
          {drop.price ? (
            <span className="hm-price">
              <Money amount={drop.price.actionToken} currency="ACTION" short />
              <small>
                ≈ <Money amount={drop.price.usd} currency="USD" />
              </small>
            </span>
          ) : (
            <span className="hm-price">—</span>
          )}
          <Link href={`/item/${drop.slug}`} className="hm-collect">
            Collect
          </Link>
        </div>
      </div>
    </article>
  );
}

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Art",
  VIDEO: "Video",
  MODEL_3D: "3D",
  DOCUMENT: "Doc",
  ROYALTY: "Royalty",
  TICKET: "Ticket",
  MERCH: "Merch",
};

/** Time left as hh:mm:ss (days in front past 24h), ticking once a second while on screen. */
function Countdown({ to }: { to: Date | string }) {
  const end = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (now == null) return <b>…</b>;
  const t = Math.max(0, Math.floor((end - now) / 1000));
  if (t === 0) return <b>Ended</b>;
  const d = Math.floor(t / 86400);
  const hms = [Math.floor(t / 3600) % 24, Math.floor(t / 60) % 60, t % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return <b>{d > 0 ? `${d}d ${hms}` : hms}</b>;
}

/** A bounty as a "Wanted" poster pinned to the board. */
function Poster({ bounty }: { bounty: Bounty }) {
  return (
    <Link href={`/bounty/${bounty.id}`} className="hm-poster">
      <span className="hm-poster-w">Wanted</span>
      <span className="hm-poster-by">By {bounty.artist?.name ?? "Action Tokens"}</span>
      <span className="hm-poster-mug" aria-hidden>
        {bounty.artist?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
          <img src={bounty.artist.avatarUrl} alt="" loading="lazy" />
        ) : (
          <Crosshair className="size-14" strokeWidth={1.4} />
        )}
      </span>
      <span className="hm-poster-title">{bounty.title}</span>
      {bounty.summary && <span className="hm-poster-sum">{bounty.summary}</span>}
      <span className="hm-poster-reward">
        <span>Reward</span>
        <b>
          <Money
            amount={bounty.prize.amount}
            currency={bounty.prize.currency}
            code={bounty.prize.code}
            short
          />
        </b>
      </span>
      <span className="hm-poster-foot">
        <span>
          <span className="hm-escrow">
            <i /> In escrow
          </span>
          {bounty.participants} {bounty.participants === 1 ? "hunter" : "hunters"}
        </span>
        <span className="hm-poster-join">Join</span>
      </span>
    </Link>
  );
}

/** An organization: cover, initials badge, its fan token's price, counts, Follow and Buy. */
function OrgCard({ org, signedIn }: { org: Org; signedIn: boolean }) {
  const initials = org.name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <article className="hm-org">
      <Link href={`/artist/${org.slug}`} className="hm-org-cover" aria-hidden tabIndex={-1}>
        {org.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
          <img src={org.coverUrl} alt="" loading="lazy" />
        )}
      </Link>
      <div className="hm-org-body">
        <Link href={`/artist/${org.slug}`} className="hm-org-top">
          <span className="hm-org-logo">
            {org.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
              <img src={org.avatarUrl} alt="" />
            ) : (
              <span className="lp-chrome">{initials}</span>
            )}
          </span>
          <span className="min-w-0 pb-1">
            <span className="hm-org-name">
              <span className="truncate">{org.name}</span>
              <BadgeCheck className="text-primary-text size-4 shrink-0" />
            </span>
            {org.bio && <span className="hm-org-bio">{org.bio}</span>}
          </span>
        </Link>
        {org.token && (
          <div className="hm-org-tok">
            <span>
              <span className="hm-org-sym">${org.token.code}</span>
              <span className="hm-org-px">
                {org.token.price ? (
                  <Money amount={org.token.price.actionToken} currency="ACTION" short />
                ) : (
                  "Not for sale"
                )}
              </span>
            </span>
            {org.token.price && (
              <span className="hm-org-usd">
                ≈ <Money amount={org.token.price.usd} currency="USD" />
              </span>
            )}
          </div>
        )}
        <div className="hm-org-stats">
          <span>
            <b>{org.items}</b>
            <small>Drops</small>
          </span>
          <span>
            <b>{compact(org.followers)}</b>
            <small>Crew</small>
          </span>
        </div>
        <div className="hm-org-actions">
          <FollowButton
            slug={org.slug}
            initial={signedIn && org.following}
            initialSubscribed={signedIn && org.subscribed}
            compact
          />
          {org.token?.price && (
            <Link href={`/item/${org.token.slug}`} className="hm-buy-tok">
              Buy ${org.token.code}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

/** Crews: the biggest token-gated communities, each saying what it takes to get in. */
function Crews({ signedIn }: { signedIn: boolean }) {
  const crews = api.community.trending.useQuery({ limit: 4 });
  if (!crews.data?.length) return null;
  return (
    <Section
      tag="Run with a crew"
      title="Crews"
      note="Token-gated communities. Hold the token, get in the room."
      more={{ href: "/communities", label: "All crews" }}
    >
      <div className="hm-crews">
        {crews.data.map((crew) => (
          <CrewRow key={crew.id} crew={crew} signedIn={signedIn} />
        ))}
      </div>
    </Section>
  );
}

function CrewRow({ crew, signedIn }: { crew: Crew; signedIn: boolean }) {
  const gated = crew.isTokenGated && crew.requirements.length > 0;
  const gate = api.community.gate.useQuery(
    { communityId: crew.id },
    { enabled: signedIn && gated, staleTime: 60_000 },
  );
  const first = crew.requirements[0];
  const check = gate.data?.checks?.[0];
  const label = !gated
    ? "Open crew"
    : `Hold ${Number(first!.requiredBalance).toLocaleString("en-US")} $${first!.assetCode}` +
      (crew.requirements.length > 1 ? ` +${crew.requirements.length - 1}` : "") +
      (check ? ` · you have ${check.held.toLocaleString("en-US")}` : "");
  const ok = !gated || gate.data?.passes === true;
  return (
    <Link href={`/communities/${crew.id}`} className="hm-crew">
      <span className="hm-crew-ban" aria-hidden>
        {crew.profileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- pictures come from many hosts
          <img src={crew.profileUrl} alt="" loading="lazy" />
        ) : (
          <Users className="size-7" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="hm-crew-title">{crew.title}</span>
        <span className="hm-crew-desc">{crew.description}</span>
        <span className="hm-crew-count">
          <Users className="size-3.5" /> {compact(crew._count.members)} members ·{" "}
          {compact(crew._count.posts)} posts
        </span>
      </span>
      <span className={cn("hm-gate", ok && "hm-gate--ok")}>{label}</span>
    </Link>
  );
}

/** Marks each `[data-reveal]` inside the returned ref with `data-in` once it reaches the screen. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!items?.length) return;
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
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  return ref;
}
