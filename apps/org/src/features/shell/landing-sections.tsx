import { BadgeCheck } from "lucide-react";

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
