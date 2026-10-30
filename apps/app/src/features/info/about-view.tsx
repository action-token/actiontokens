import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { InfoCard } from "./info-card";

const WHY = [
  {
    icon: "🎸",
    title: "Empowered artists",
    text: "Take control of your music and revenue streams.",
  },
  { icon: "🎧", title: "Engaged fans", text: "Build deeper connections with artists you love." },
  {
    icon: "🚀",
    title: "Innovative technology",
    text: "Leverage the Stellar blockchain for efficiency and scalability.",
  },
];

/** What Bandcoin is, for artists and for fans (bandfan's About page). */
export function AboutView() {
  return (
    <PageBody className="grid max-w-3xl gap-6">
      <PageHeader title="About" note="*music and fans, on Stellar*" />
      <p className="text-base leading-relaxed text-pretty">
        Bandcoin is a platform designed to empower bands and music lovers by connecting them with
        the Stellar blockchain. Our mission is to change how artists and fans engage, collaborate
        and grow in the music industry.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="For bands and artists">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Tokenize your music and create unique digital assets.</li>
            <li>Engage directly with fans through blockchain tools.</li>
            <li>Earn from your creativity securely and transparently.</li>
          </ul>
        </InfoCard>
        <InfoCard title="For fans">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Exclusive access to music and collectibles.</li>
            <li>Ways to support your favorite artists directly.</li>
            <li>An easy way to discover and engage with music.</li>
          </ul>
        </InfoCard>
      </div>

      <section className="grid gap-3">
        <h2 className="display text-2xl">Why Bandcoin?</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {WHY.map((reason) => (
            <InfoCard key={reason.title}>
              <span className="text-3xl" aria-hidden>
                {reason.icon}
              </span>
              <b className="text-fg text-base">{reason.title}</b>
              <p>{reason.text}</p>
            </InfoCard>
          ))}
        </div>
      </section>

      <p className="text-base text-pretty">
        Bandcoin bridges music and technology: a place where creativity and community thrive.
      </p>
      <Button asChild size="lg" className="justify-self-start">
        <Link href="/">Explore Bandcoin</Link>
      </Button>
    </PageBody>
  );
}
