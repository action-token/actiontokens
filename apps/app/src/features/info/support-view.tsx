import { Bug, ChevronDown, LifeBuoy, Megaphone, Wallet } from "lucide-react";

import { PageBody } from "@bandcoin/ui/patterns/page-header";
import { SOCIALS } from "@bandcoin/ui/patterns/site-links";

import { STICKER } from "./info-card";
import { InfoHero } from "./info-hero";

const CONTACTS = [
  { icon: LifeBuoy, title: "Technical support", email: "support@bandcoin.io" },
  { icon: Wallet, title: "Sales questions", email: "sales@bandcoin.io" },
  { icon: Megaphone, title: "Press", email: "press@bandcoin.io" },
  { icon: Bug, title: "Bug report", email: "bugs@bandcoin.io" },
];

const FAQ = [
  {
    question: "How do I add BANDCOIN to my wallet?",
    answer:
      "Open Recharge from the wallet menu. You can pay by card (email, Google and Apple accounts) or swap some XLM. The price you will get is shown before you confirm.",
  },
  {
    question: "Should I pay with my wallet or a card?",
    answer:
      "If you signed in with a wallet, you pay in BANDCOIN from it. If you signed in with email, Google or Apple, you can pay by card and Bandcoin sends the BANDCOIN for you. Either way you see the total before you pay.",
  },
  {
    question: "What is the network fee?",
    answer:
      "A small cost for recording your purchase on the Stellar network. It is shown as its own line in the price breakdown, so there are no surprises at the end.",
  },
  {
    question: "What is the difference between following and subscribing?",
    answer:
      "Following an artist is free. Subscribing means you also trust their fan token, which costs a small refundable reserve. Artists can keep some posts, stories and drops for subscribers only.",
  },
  {
    question: "Why can't I see a post or story?",
    answer:
      "The artist chose who can see it: followers, subscribers or members who hold enough of their fan token. A locked card tells you what unlocks it.",
  },
  {
    question: "How do I collect a drop in AR?",
    answer:
      "Open the AR app from the sidebar, find a drop on the map, go to the spot and collect it. You can move what you collected to your wallet afterwards.",
  },
  {
    question: "How do I sell something I bought?",
    answer:
      "Open the item you own and choose Sell your copies, then set a price in BANDCOIN and in dollars for card buyers. Your listings and sales are on the Selling page, and you can change the price or take a copy off sale any time.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "Go to Settings. Artist accounts have items and sales attached, so write to technical support and we will remove them. Anything already recorded on the Stellar network stays there.",
  },
];

/** Who to write to, answers to common questions, and where to find us. */
export function SupportView() {
  return (
    <>
      <InfoHero eyebrow="Support" title="We're here to help" note="write to the right team">
        <p className="max-w-xl text-base leading-relaxed font-medium text-pretty">
          Tell us your username or wallet address so we can find your account, and we&apos;ll get
          back to you.
        </p>
      </InfoHero>
      <PageBody className="grid max-w-5xl gap-10">
        <section className="grid gap-4" aria-label="Contact">
          <ul className="grid gap-4 sm:grid-cols-2">
            {CONTACTS.map((contact) => (
              <li key={contact.email}>
                <a
                  href={`mailto:${contact.email}`}
                  className={`bg-surface flex items-center gap-4 rounded-[1.4rem] p-4 sm:p-5 ${STICKER}`}
                >
                  <span className="bg-primary text-primary-foreground border-fg flex size-12 shrink-0 items-center justify-center rounded-full border-2">
                    <contact.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="display block text-lg">{contact.title}</span>
                    <span className="text-fg-muted block truncate text-sm">{contact.email}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-5" aria-label="Common questions">
          <div>
            <h2 className="display text-3xl">Common questions</h2>
            <p className="marker text-fg-muted mt-1 text-lg">quick answers</p>
          </div>
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {FAQ.map((entry) => (
              <details
                key={entry.question}
                className="bg-surface border-fg group open:bg-primary-soft rounded-[1.2rem] border-2 px-5 py-4 transition-colors open:shadow-[4px_5px_0_0_var(--color-primary)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
                  {entry.question}
                  <span className="bg-fg text-bg grid size-6 shrink-0 place-items-center rounded-full">
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <p className="text-fg-muted pt-3 text-sm leading-relaxed text-pretty">
                  {entry.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="bg-fg text-bg flex flex-wrap items-center justify-between gap-4 rounded-[1.6rem] p-6 sm:p-8"
          aria-label="Find us"
        >
          <div>
            <h2 className="display text-2xl">Find us</h2>
            <p className="marker text-lg opacity-70">news, drops and shout-outs</p>
          </div>
          <ul className="flex flex-wrap gap-3">
            {SOCIALS.map((social) => (
              <li key={social.href}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5"
                >
                  <social.icon className="size-4" />
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  );
}
