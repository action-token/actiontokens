"use client";

import { ArrowUpRight, Building2, Crosshair, Landmark, ScanLine } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { api, type RouterOutputs } from "~/trpc/react";

import { AR_URL, artistEntry, ORG_URL } from "../shell/nav";

type Home = RouterOutputs["catalog"]["home"];

/** The studio exhibition (the 3D gallery), once it has an address (owner to confirm the domain). */
const GALLERY_URL = process.env.NEXT_PUBLIC_GALLERY_URL;

/**
 * The foot of the page: the three other places Action Tokens lives, each with a small animated
 * scene of what happens there, drawn from the home data:
 * - the organization portal: a drop card, a Wanted poster and a fan token coin with its chart
 * - Action AR: a phone with the map, pins pulsing, a radar sweep and a "claimed" toast
 * - the studio exhibition: a gallery corridor whose walls hang real drop art, walking forward
 * Then the "Do something." sign-off and the links. A dark stage in both themes. The scenes only
 * move while the footer is on screen; transform and opacity only.
 */
export function HomeFooter({ home }: { home: Home }) {
  const { status } = useSession();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const org = artistEntry(me.data?.organization ?? null);
  const root = useRef<HTMLElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setLive(entry?.isIntersecting ?? false), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const tokenOrg = home.artists.find((entry) => entry.token?.price) ?? home.artists[0];
  const drop = home.drops[0];
  const bounty = home.bounties[0];
  const covers = home.drops.map((entry) => entry.coverUrl).filter(Boolean);

  return (
    <footer ref={root} className="hm-foot" data-live={live || undefined}>
      <div className="hm-foot-places">
        <Place
          id="org"
          href={ORG_URL}
          icon={<Building2 className="size-5" strokeWidth={2} />}
          tag="For organizations"
          title={org.title}
          text="Launch drops, post bounties, run your fan token and your crew."
          cta={org.title === "Become an organization" ? "Get started" : "Open the portal"}
          stage={
            <OrgStage
              dropTitle={drop?.title ?? "Neon print"}
              dropCover={drop?.coverUrl ?? null}
              reward={bounty ? `${bounty.prize.amount}` : "600"}
              code={tokenOrg?.token?.code ?? "ACTION"}
              orgName={tokenOrg?.name ?? "Your org"}
            />
          }
        />
        <Place
          id="ar"
          href={AR_URL}
          icon={<ScanLine className="size-5" strokeWidth={2} />}
          tag="Out there"
          title="Action AR"
          text="Pins wait on the map. Walk up, open the camera, collect the drop."
          cta="Open AR"
          stage={<ArStage claim={drop?.title ?? "Neon mural pin"} />}
        />
        <Place
          id="gallery"
          href={GALLERY_URL}
          icon={<Landmark className="size-5" strokeWidth={2} />}
          tag="Walk it"
          title="Studio exhibition"
          text="Every organization's 3D gallery: walk the halls and see what hangs on the walls."
          cta={GALLERY_URL ? "Enter the exhibition" : "Opening soon"}
          stage={<GalleryStage covers={covers} />}
        />
      </div>

      <div className="hm-foot-main">
        <p className="hm-foot-big lp-chrome">
          Do
          <br />
          something.
        </p>
        <nav className="hm-foot-cols" aria-label="Footer">
          <ul>
            <li>Platform</li>
            <li>
              <Link href="/marketplace">Drops</Link>
            </li>
            <li>
              <Link href="/bounties">Bounties</Link>
            </li>
            <li>
              <Link href="/artists">Organizations</Link>
            </li>
            <li>
              <Link href="/music">Music</Link>
            </li>
          </ul>
          <ul>
            <li>Elsewhere</li>
            <li>
              <a href={ORG_URL}>Organization portal</a>
            </li>
            <li>
              <a href={AR_URL}>Action AR</a>
            </li>
            <li>
              {GALLERY_URL ? (
                <a href={GALLERY_URL}>Studio exhibition</a>
              ) : (
                <span>Studio exhibition · soon</span>
              )}
            </li>
          </ul>
          <ul>
            <li>Action Tokens</li>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/support">Support</Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="hm-foot-base">
        <span>© {new Date().getFullYear()} Action Tokens</span>
        <span className="hm-foot-live">
          <i /> Live on Stellar
        </span>
      </div>
    </footer>
  );
}

function Place({
  id,
  href,
  icon,
  tag,
  title,
  text,
  cta,
  stage,
}: {
  id: string;
  href: string | undefined;
  icon: ReactNode;
  tag: string;
  title: string;
  text: string;
  cta: string;
  stage: ReactNode;
}) {
  const body = (
    <>
      <span className="hm-place-stage" aria-hidden>
        {stage}
      </span>
      <span className="hm-place-copy">
        <span className="hm-place-head">
          <span className="hm-place-icon">{icon}</span>
          <span className="lp-tag">{tag}</span>
        </span>
        <span className="hm-place-title lp-chrome">{title}</span>
        <span className="hm-place-text">{text}</span>
        <span className="hm-place-cta">
          {cta} {href && <ArrowUpRight className="size-4" />}
        </span>
      </span>
    </>
  );
  return href ? (
    <a href={href} className="hm-place" data-place={id}>
      {body}
    </a>
  ) : (
    <div className="hm-place" data-place={id} data-soon>
      {body}
    </div>
  );
}

/** The portal's tools at work: a drop card, a Wanted poster and a fan token coin with its chart. */
function OrgStage({
  dropTitle,
  dropCover,
  reward,
  code,
  orgName,
}: {
  dropTitle: string;
  dropCover: string | null;
  reward: string;
  code: string;
  orgName: string;
}) {
  return (
    <span className="st-org">
      <span className="st-org-drop">
        <span className="st-org-art">
          {dropCover && (
            // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
            <img src={dropCover} alt="" loading="lazy" />
          )}
          <b>New drop</b>
        </span>
        <span className="st-org-line">{dropTitle}</span>
        <span className="st-org-pill">Collect</span>
      </span>
      <span className="st-org-poster">
        <span className="st-org-w">Wanted</span>
        <span className="st-org-mug">
          <Crosshair className="size-6" strokeWidth={1.5} />
        </span>
        <span className="st-org-reward">
          <small>Reward</small> {reward}
        </span>
      </span>
      <span className="st-org-token">
        <span className="st-org-coin">
          <span>${code.slice(0, 5)}</span>
        </span>
        <span className="st-org-chart">
          {[38, 52, 44, 66, 58, 80, 92].map((height, index) => (
            <i key={index} style={{ height: `${height}%`, animationDelay: `${index * 0.12}s` }} />
          ))}
        </span>
        <span className="st-org-name">{orgName}</span>
      </span>
      <span className="st-org-launch">Launched ✓</span>
    </span>
  );
}

/** Out on the map: a phone with roads, pins pulsing, a radar sweep around you and a claim toast. */
function ArStage({ claim }: { claim: string }) {
  return (
    <span className="st-ar">
      <span className="st-ar-pin st-ar-pin--a" />
      <span className="st-ar-pin st-ar-pin--b" />
      <span className="st-ar-phone">
        <span className="st-ar-map">
          <i className="st-ar-road" style={{ top: "38%", rotate: "-9deg" }} />
          <i className="st-ar-road" style={{ top: "70%", rotate: "5deg" }} />
          <i className="st-ar-road st-ar-road--v" style={{ left: "40%", rotate: "10deg" }} />
          <span className="st-ar-dot" style={{ left: "22%", top: "24%" }} />
          <span className="st-ar-dot st-ar-dot--gold" style={{ left: "72%", top: "30%" }} />
          <span className="st-ar-dot" style={{ left: "66%", top: "64%" }} />
          <span className="st-ar-me">
            <span className="st-ar-sweep" />
          </span>
        </span>
        <span className="st-ar-toast">
          <b>+40 ACTION</b>
          <span>{claim}</span>
        </span>
      </span>
    </span>
  );
}

/** Walking the exhibition: two walls in perspective hung with drop art, sliding toward you. */
function GalleryStage({ covers }: { covers: string[] }) {
  const frames = covers.length > 0 ? covers : Array.from({ length: 6 }, () => "");
  // each wall shows the art twice in a row so it can loop seamlessly
  const left = [...frames.slice(0, 5), ...frames.slice(0, 5)];
  const right = [...frames.slice(5, 10), ...frames.slice(5, 10)];
  const wall = (list: string[], side: "l" | "r") => (
    <span className={`st-gal-wall st-gal-wall--${side}`}>
      <span className="st-gal-strip">
        {(list.length > 0 ? list : left).map((src, index) => (
          <span key={index} className="st-gal-frame">
            {src && (
              // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
              <img src={src} alt="" loading="lazy" />
            )}
          </span>
        ))}
      </span>
    </span>
  );
  return (
    <span className="st-gal">
      {wall(left, "l")}
      {wall(right, "r")}
      <span className="st-gal-floor" />
      <span className="st-gal-fog" />
    </span>
  );
}
