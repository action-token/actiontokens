import {
  BadgeCheck,
  Check,
  Headphones,
  MapPin,
  Mic2,
  Music,
  Newspaper,
  Repeat,
  Rocket,
  Ticket,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@actiontokens/ui/components/button";
import { PageBody } from "@actiontokens/ui/patterns/page-header";

import { InfoHero } from "./info-hero";
import { STICKER } from "./info-card";

const THINGS = [
  {
    icon: Music,
    title: "Music and collectibles",
    text: "Buy songs, albums, artwork, tickets and fan tokens from the organizations themselves, and keep them in your wallet.",
  },
  {
    icon: Newspaper,
    title: "Feed and stories",
    text: "Follow organizations for their posts and 24-hour stories. Past stories stay on their page as highlights.",
  },
  {
    icon: MapPin,
    title: "AR drops and bounties",
    text: "Find drops on the map, collect them in AR, and take on bounties organizations set for their fans.",
  },
  {
    icon: Repeat,
    title: "Resale",
    text: "Sell a copy you own to another fan at the price you choose. Organizations can earn a royalty on every resale.",
  },
  {
    icon: BadgeCheck,
    title: "Follow and subscribe",
    text: "Following is free. Subscribe by trusting an organization's fan token to unlock the posts, stories and drops kept for subscribers.",
  },
  {
    icon: Ticket,
    title: "Events",
    text: "See where organizations play next, and use tickets that live in your wallet.",
  },
];

const WHY = [
  {
    icon: Mic2,
    title: "Organizations keep control",
    text: "Organizations set their prices and audiences, and are paid straight to their own accounts.",
  },
  {
    icon: Headphones,
    title: "Fans own it",
    text: "What you buy is yours on the Stellar network. Sell it or give it away.",
  },
  {
    icon: Rocket,
    title: "Simple to start",
    text: "Sign in with email, Google or Apple, or bring your own wallet. Pay with ACTION or a card.",
  },
];

const ARTISTS = [
  "Sell songs, albums, art, tickets and a fan token of your own.",
  "Share posts and stories, and choose who can see each one.",
  "Drop collectibles on the map and set bounties for your fans.",
  "Earn from sales and every resale, paid straight to your accounts.",
];

const FANS = [
  "Own the music and collectibles you buy, and resell them if you like.",
  "Follow your favourite organizations for free, and subscribe for more.",
  "Collect drops around you with AR, and take part in bounties.",
  "Pay with ACTION from your wallet, or by card.",
];

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 text-[15px] leading-snug">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="bg-fg/10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
            <Check className="size-3" strokeWidth={3} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** What Action Tokens is now, for artists and for fans. */
export function AboutView() {
  return (
    <>
      <InfoHero
        eyebrow="About Action Tokens"
        title="Music and fans, on Stellar"
        note="organizations get paid, fans get to keep it"
      >
        <Button asChild size="lg" className="bg-fg text-bg hover:bg-fg/90">
          <Link href="/marketplace">Explore the marketplace</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="border-fg border-2 bg-transparent">
          <Link href="/support">Get help</Link>
        </Button>
      </InfoHero>
      <PageBody className="mx-auto grid max-w-5xl gap-10">
        <p className="max-w-3xl text-lg leading-relaxed text-pretty">
          Action Tokens is where organizations sell music and more straight to the fans who love it,
          and where fans collect, follow and support them. Everything you buy is recorded on the
          Stellar network, so it is yours, not ours.
        </p>

        <div className="grid gap-5 md:grid-cols-2">
          <section
            className={`bg-primary text-primary-foreground grid content-start gap-5 rounded-[1.6rem] p-6 sm:p-8 ${STICKER} shadow-[6px_7px_0_0_var(--color-fg)]`}
          >
            <h2 className="display text-4xl">For organizations</h2>
            <Checklist items={ARTISTS} />
          </section>
          <section
            className={`bg-fg text-bg grid content-start gap-5 rounded-[1.6rem] p-6 sm:p-8 ${STICKER}`}
          >
            <h2 className="display text-4xl">For fans</h2>
            <Checklist items={FANS} />
          </section>
        </div>

        <section className="grid gap-5" aria-label="What you can do here">
          <div>
            <h2 className="display text-4xl">What you can do here</h2>
            <p className="marker text-fg-muted mt-1 text-lg">six things, one place</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {THINGS.map((thing) => (
              <li
                key={thing.title}
                className={`bg-surface grid content-start gap-3 rounded-[1.4rem] p-5 ${STICKER}`}
              >
                <span className="bg-primary text-primary-foreground border-fg grid size-11 place-items-center rounded-full border-2">
                  <thing.icon className="size-5" />
                </span>
                <h3 className="display text-2xl">{thing.title}</h3>
                <p className="text-fg-muted text-sm leading-relaxed">{thing.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-5" aria-label="Why Action Tokens">
          <div>
            <h2 className="display text-4xl">Why Action Tokens?</h2>
            <p className="marker text-fg-muted mt-1 text-lg">in three lines</p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {WHY.map((reason, index) => (
              <li key={reason.title} className="grid content-start gap-2 border-t-[3px] pt-4">
                <span className="display text-primary-text text-6xl leading-none">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="display flex items-center gap-2 text-2xl">
                  <reason.icon className="size-5" /> {reason.title}
                </h3>
                <p className="text-fg-muted text-sm leading-relaxed">{reason.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </PageBody>
    </>
  );
}
