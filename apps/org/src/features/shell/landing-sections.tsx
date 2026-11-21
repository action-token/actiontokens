import { BadgeCheck, Code2, MapPin, ScanLine } from "lucide-react";

/**
 * The landing page's section bodies, in the style of docs/mockups/home.html: drop cards on a
 * snap rail, wanted posters for bounties, black panels for the map and the embed, and the card
 * an organization gets on the marketplace. All examples, drawn with CSS (no images, no canvas
 * loops, no 3D), so they cost nothing while the page sits still.
 */

const DROPS = [
  {
    title: "Sunset Sessions Poster",
    org: "Rooftop Records",
    kind: "Legend",
    ed: "41/300",
    left: "2d 4h",
    price: 250,
    art: "linear-gradient(160deg,#ff8a3d,#ff3d7f 45%,#6b3dff)",
  },
  {
    title: "Rooftop Live Entry",
    org: "Rooftop Records",
    kind: "Ticket",
    ed: "12/200",
    left: "5d 1h",
    price: 500,
    art: "linear-gradient(160deg,#3ef0ff,#3d7bff 50%,#20124d)",
  },
  {
    title: "Night Drive (Single)",
    org: "Phonk Union HQ",
    kind: "Song",
    ed: "Open",
    left: "No end",
    price: 90,
    art: "linear-gradient(160deg,#d4ff2a,#0aff54 50%,#04320f)",
  },
  {
    title: "Chrome Skull Key",
    org: "Night Shift Crew",
    kind: "Epic",
    ed: "7/50",
    left: "18h",
    price: 300,
    art: "linear-gradient(160deg,#f2f2f2,#7a7a7a 45%,#111)",
  },
  {
    title: "Record Tote",
    org: "Rooftop Records",
    kind: "Merch",
    ed: "8/150",
    left: "9d",
    price: 900,
    art: "linear-gradient(160deg,#b06bff,#ff3dd8 55%,#3d0b40)",
  },
  {
    title: "Riverbank Cleanup Badge",
    org: "GreenWave Volunteers",
    kind: "Rare",
    ed: "88/500",
    left: "3d",
    price: 40,
    art: "linear-gradient(160deg,#5dffb1,#0aa36b 50%,#032b1d)",
  },
];

const BOUNTIES = [
  {
    title: "Best Rooftop Moment",
    rules: ["Video", "Under 60s", "3 winners"],
    prize: 750,
    joined: 12,
    art: "linear-gradient(160deg,#ff8a3d,#6b3dff)",
  },
  {
    title: "Remix the Single",
    rules: ["Stems given", "Any genre"],
    prize: 1200,
    joined: 27,
    art: "linear-gradient(160deg,#0aff54,#04320f)",
  },
  {
    title: "Clean the Riverbank",
    rules: ["Photo proof", "Team ok"],
    prize: 500,
    joined: 41,
    art: "linear-gradient(160deg,#3ef0ff,#20124d)",
  },
];

export function DropRail() {
  return (
    <div className="lp-rail" data-reveal>
      {DROPS.map((drop) => (
        <article key={drop.title} className="lp-drop">
          <div className="lp-drop-art" style={{ background: drop.art }}>
            <span className="lp-badge">{drop.kind}</span>
            <span className="lp-ed">{drop.ed}</span>
            <span className="lp-cd">
              Ends in <b>{drop.left}</b>
            </span>
          </div>
          <div className="px-1 pt-3 pb-1">
            <span className="text-fg-muted flex items-center gap-1.5 text-xs">
              <BadgeCheck className="text-primary-text size-3.5" /> {drop.org}
            </span>
            <h3 className="lp-drop-title">{drop.title}</h3>
            <div className="flex items-center justify-between">
              <span className="lp-price">
                {drop.price} <small>ACTION</small>
              </span>
              <span className="lp-buy">Buy</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function WantedBoard() {
  return (
    <div className="lp-board">
      {BOUNTIES.map((bounty, index) => (
        <article
          key={bounty.title}
          className="lp-poster"
          data-reveal
          style={{ transitionDelay: `${index * 90}ms` }}
        >
          <p className="lp-poster-w">Wanted</p>
          <p className="lp-poster-sub">Bounty · prize in escrow</p>
          <div className="lp-poster-mug" style={{ background: bounty.art }} />
          <h3 className="lp-poster-title">{bounty.title}</h3>
          <div className="lp-rules">
            {bounty.rules.map((rule) => (
              <i key={rule}>{rule}</i>
            ))}
          </div>
          <div className="lp-reward">
            <span>Reward</span>
            <b>{bounty.prize.toLocaleString()} ACTION</b>
          </div>
          <div className="lp-poster-foot">
            <span className="lp-escrow">
              <i /> In escrow
            </span>
            <span>{bounty.joined} joined</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function MapPanels() {
  return (
    <div className="lp-split">
      <div className="lp-panel" data-reveal>
        <div className="lp-panel-map" aria-hidden>
          {[
            { x: "22%", y: "30%" },
            { x: "56%", y: "52%" },
            { x: "78%", y: "24%" },
            { x: "38%", y: "68%" },
          ].map((pin, index) => (
            <span
              key={index}
              className="lp-pin"
              style={{ left: pin.x, top: pin.y, animationDelay: `${index * -0.7}s` }}
            >
              <MapPin className="size-4" />
            </span>
          ))}
        </div>
        <div className="lp-panel-txt">
          <p className="lp-tag">Go outside</p>
          <h3 className="lp-panel-title">Drops on the map</h3>
          <p className="text-[#a3a3a3]">
            Pin collectibles to real places. Fans walk there and catch them in AR. You choose when
            they open, how many exist and who can take one.
          </p>
          <span className="lp-panel-chip">
            <ScanLine className="size-4" /> Collected in the AR app
          </span>
        </div>
      </div>

      <div className="lp-panel" data-reveal style={{ transitionDelay: "100ms" }}>
        <div className="lp-panel-code" aria-hidden>
          <pre>
            <span className="text-[#6e6e6e]">{"<!-- your website -->"}</span>
            {"\n"}
            <span className="text-[#4dff2a]">{"<iframe"}</span>
            {"\n  src="}
            <span className="text-[#ffb020]">
              {'"https://org.action-tokens.com/embed/rooftop"'}
            </span>
            {"\n  width="}
            <span className="text-[#ffb020]">{'"100%"'}</span>
            {" height="}
            <span className="text-[#ffb020]">{'"480"'}</span>
            <span className="text-[#4dff2a]">{" />"}</span>
          </pre>
        </div>
        <div className="lp-panel-txt">
          <p className="lp-tag">On your site</p>
          <h3 className="lp-panel-title">Your map, anywhere</h3>
          <p className="text-[#a3a3a3]">
            Embed your live map on your own website with one snippet, in your colours. New pins show
            up there the moment you drop them.
          </p>
          <span className="lp-panel-chip">
            <Code2 className="size-4" /> One line of code
          </span>
        </div>
      </div>
    </div>
  );
}

/** The card an organization gets on the marketplace: cover, logo, token price, stats. */
export function OrgCardPreview() {
  return (
    <article className="lp-org" data-reveal>
      <div className="lp-org-cover">
        <span className="lp-org-cat">
          <i>Music</i>
          <i>Live</i>
        </span>
      </div>
      <div className="lp-org-body">
        <div className="flex items-end gap-3">
          <span className="lp-org-logo">RR</span>
          <span className="min-w-0 pb-1">
            <span className="flex items-center gap-1.5 text-[17px] font-bold">
              Rooftop Records <BadgeCheck className="text-primary-text size-4" />
            </span>
            <span className="text-fg-muted text-xs">Music · Dhaka</span>
          </span>
        </div>
        <div className="lp-org-tok">
          <span>
            <span className="text-fg-muted block font-mono text-xs">ROOF / ACTION</span>
            <span className="font-mono text-lg font-bold">1.84</span>{" "}
            <span className="text-primary-text font-mono text-[11px] font-semibold">+12.4%</span>
          </span>
          <svg viewBox="0 0 96 32" className="h-8 w-24" aria-hidden>
            <polyline
              points="0,26 12,22 22,24 34,15 46,18 58,10 70,12 82,5 96,7"
              fill="none"
              stroke="var(--gx-neon)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="lp-org-stats">
          <div>
            <b>1.2k</b>
            <small>Holders</small>
          </div>
          <div>
            <b>24</b>
            <small>Drops</small>
          </div>
          <div className="lp-live">
            <b>3</b>
            <small>Live</small>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="lp-follow">Follow</span>
          <span className="lp-buytok">Buy ROOF</span>
        </div>
      </div>
    </article>
  );
}
