import type { ReactNode } from "react";

import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { InfoCard } from "./info-card";
import { InfoHero } from "./info-hero";

/**
 * DRAFT: written from what the apps do today, for the owner to review (ideally
 * with a lawyer). Set to false, and fill in the date below, once it is approved.
 */
const DRAFT = true;
const EFFECTIVE_DATE: string | null = null;

const SECTIONS = [
  { id: "introduction", title: "Introduction" },
  { id: "information-we-collect", title: "Information we collect" },
  { id: "what-is-public", title: "What is public" },
  { id: "how-we-use-it", title: "How we use it" },
  { id: "third-party-services", title: "Third-party services" },
  { id: "cookies", title: "Cookies" },
  { id: "your-choices", title: "Your choices" },
  { id: "security", title: "Security" },
  { id: "childrens-privacy", title: "Children's privacy" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact-us", title: "Contact us" },
];

const SHORT = [
  "We never see or store your card number: Square handles it.",
  "We don't sell your personal information.",
  "The Stellar network is public and permanent, so your wallet's activity can be seen by anyone.",
];

/** One numbered section, matching its place in the contents list. */
function Part({ id, children }: { id: string; children: ReactNode }) {
  const number = SECTIONS.findIndex((section) => section.id === id) + 1;
  return (
    <section id={id} className="relative scroll-mt-24">
      <span className="bg-primary text-primary-foreground border-fg display absolute -top-3 -left-3 z-10 grid size-9 place-items-center rounded-full border-2 text-lg">
        {number}
      </span>
      {children}
    </section>
  );
}

/** Bandcoin's privacy policy, from what the fan app, artist portal and AR app do. */
export function PrivacyView() {
  return (
    <>
      <InfoHero
        eyebrow={EFFECTIVE_DATE ? `Effective ${EFFECTIVE_DATE}` : "Privacy"}
        title="Privacy policy"
        note="what we collect, and why"
      />
      <PageBody className="grid max-w-5xl gap-8">
        {DRAFT && (
          <p
            role="note"
            className="bg-primary-soft border-fg rounded-xl border-2 border-dashed p-4 text-sm font-semibold"
          >
            Draft for review. This text describes what Bandcoin does today and has not yet been
            approved as our policy.
          </p>
        )}

        <section
          className="bg-fg text-bg grid gap-4 rounded-[1.6rem] p-6 sm:p-8"
          aria-label="The short version"
        >
          <h2 className="display text-3xl">The short version</h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {SHORT.map((line) => (
              <li key={line} className="bg-bg/10 rounded-xl p-4 text-sm leading-snug font-medium">
                {line}
              </li>
            ))}
          </ul>
        </section>

        <p className="max-w-3xl text-base leading-relaxed text-pretty">
          This policy explains what information Bandcoin collects when you use the marketplace, the
          artist portal and the AR app, how it is used, and the choices you have. By using Bandcoin
          you agree to the practices described here.
        </p>

        <div className="grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav
            aria-label="Contents"
            className="bg-surface-2 border-fg/15 rounded-2xl border-2 p-4 text-sm lg:sticky lg:top-6"
          >
            <p className="display mb-2 text-xl">Contents</p>
            <ol className="grid gap-1.5">
              {SECTIONS.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-fg-muted hover:text-fg hover:underline"
                  >
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="grid gap-5">
            <Part id="introduction">
              <InfoCard title="Introduction">
                <p>
                  Bandcoin is a platform where artists sell music and collectibles to fans, and
                  where fans follow artists, collect drops with AR and resell what they own.
                  Purchases are recorded on the Stellar network. This policy covers the Bandcoin
                  websites and apps.
                </p>
              </InfoCard>
            </Part>

            <Part id="information-we-collect">
              <InfoCard title="Information we collect">
                <p className="text-fg font-semibold">1. Your account</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Your sign-in: your email address, or the Google or Apple account you used.
                  </li>
                  <li>
                    Your Stellar wallet address (every account has one, yours or one we create).
                  </li>
                  <li>
                    Your name or username and profile picture, if you add them, and your links if
                    you are an artist.
                  </li>
                </ul>
                <p className="text-fg font-semibold">2. What you do on Bandcoin</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Orders and payments: what you bought, sold or sent, the amounts, and the Stellar
                    transactions behind them.
                  </li>
                  <li>
                    Following, subscribing, likes, comments, playlists, favourites and what you have
                    played.
                  </li>
                  <li>The stories you have watched, so we can show which ones are new to you.</li>
                  <li>The drops you collected, and your progress on bounties.</li>
                </ul>
                <p className="text-fg font-semibold">3. Card payments</p>
                <p>
                  When you pay by card, you type your card details into a form provided by Square.
                  Bandcoin does not receive or store your card number. We keep a record of the order
                  and the payment reference Square returns.
                </p>
                <p className="text-fg font-semibold">4. Location and photos</p>
                <p>
                  The AR app and the map use your device&apos;s location to show drops near you and
                  to check you are at a drop. You can refuse the permission in your browser or
                  phone, and those features then won&apos;t work. Where you scan a mural, the photo
                  is checked and kept with your scan.
                </p>
                <p className="text-fg font-semibold">5. What artists upload</p>
                <p>
                  Artists upload music, artwork, posts, stories and videos. Each is shown to the
                  audience the artist chooses.
                </p>
                <p className="text-fg font-semibold">6. Technical information</p>
                <p>
                  Our servers record basic technical information, such as your device type, browser
                  and the pages you request, to run the service, find faults and prevent fraud.
                </p>
              </InfoCard>
            </Part>

            <Part id="what-is-public">
              <InfoCard title="What is public">
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Artist pages, their items, and public posts and stories can be seen by anyone,
                    as the artist chooses. An artist&apos;s old stories stay on their page as
                    highlights until they remove them.
                  </li>
                  <li>An artist&apos;s follower and subscriber counts are public.</li>
                  <li>
                    <b className="text-fg">The Stellar network is public and permanent.</b> Your
                    wallet address, what it holds and every transaction it makes can be seen by
                    anyone, and cannot be deleted by Bandcoin or by you.
                  </li>
                </ul>
              </InfoCard>
            </Part>

            <Part id="how-we-use-it">
              <InfoCard title="How we use it">
                <ul className="list-disc space-y-1 pl-5">
                  <li>To run your account, show your collection and complete your orders.</li>
                  <li>To send you notifications about artists you follow and your orders.</li>
                  <li>To pay artists and work out royalties.</li>
                  <li>To keep Bandcoin safe, and to find and fix problems.</li>
                </ul>
                <p>We do not sell your personal information.</p>
              </InfoCard>
            </Part>

            <Part id="third-party-services">
              <InfoCard title="Third-party services">
                <p>We use these providers to run Bandcoin. Each sees only what it needs.</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Google Firebase: sign-in with email, Google and Apple.</li>
                  <li>Square: card payments.</li>
                  <li>The Stellar network: recording purchases and ownership.</li>
                  <li>Amazon Web Services: storing uploaded files.</li>
                  <li>Mapbox: map tiles and place search.</li>
                  <li>Google Cloud Vision: checking mural scan photos.</li>
                  <li>An email service: gift emails and account messages.</li>
                  <li>
                    Last.fm and Facebook: only if you, as a fan or an artist, choose to connect
                    them.
                  </li>
                  <li>
                    OpenAI and Google AI: artists can use these to help write text and make images
                    or music. What the artist types in is sent to them for that.
                  </li>
                  <li>Our hosting and database providers.</li>
                </ul>
              </InfoCard>
            </Part>

            <Part id="cookies">
              <InfoCard title="Cookies">
                <p>
                  Bandcoin sets a cookie to keep you signed in, and may remember your theme choice.
                  We don&apos;t use advertising or tracking cookies. Services we use, such as Square
                  and Firebase, may set their own while you use them. You can clear or block cookies
                  in your browser, but you will then not stay signed in.
                </p>
              </InfoCard>
            </Part>

            <Part id="your-choices">
              <InfoCard title="Your choices">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Change your profile in Settings.</li>
                  <li>
                    Delete your account in Settings. Artist accounts have items and sales attached,
                    so write to us and we will remove them. Records of payments we must keep, and
                    anything already on the Stellar network, stay.
                  </li>
                  <li>Disconnect Last.fm or Facebook whenever you like.</li>
                  <li>Refuse location or camera access in your browser or phone settings.</li>
                  <li>Ask us what we hold about you, or to correct it, using the address below.</li>
                </ul>
              </InfoCard>
            </Part>

            <Part id="security">
              <InfoCard title="Security">
                <p>
                  We use reasonable measures to protect your information, including encrypting the
                  account keys we store. No online service is completely secure, so we can&apos;t
                  promise absolute security. Keep your wallet keys and sign-in safe.
                </p>
              </InfoCard>
            </Part>

            <Part id="childrens-privacy">
              <InfoCard title="Children's privacy">
                <p>
                  Bandcoin isn&apos;t meant for anyone under 13 and we don&apos;t knowingly collect
                  their information. If we learn we have, we delete it. A parent or guardian who
                  knows of such a case should contact us straight away.
                </p>
              </InfoCard>
            </Part>

            <Part id="changes">
              <InfoCard title="Changes to this policy">
                <p>
                  We may update this policy. The latest version is always on this page, and we will
                  change its date when we do. Using Bandcoin after an update means you accept it.
                </p>
              </InfoCard>
            </Part>

            <Part id="contact-us">
              <InfoCard title="Contact us">
                <p>
                  Questions about this policy? Email{" "}
                  <a href="mailto:support@bandcoin.io" className="text-fg underline">
                    support@bandcoin.io
                  </a>{" "}
                  or visit{" "}
                  <a href="https://bandcoin.io" className="text-fg underline">
                    bandcoin.io
                  </a>
                  .
                </p>
              </InfoCard>
            </Part>
          </div>
        </div>
      </PageBody>
    </>
  );
}
