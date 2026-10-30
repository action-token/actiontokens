import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { InfoCard } from "./info-card";

const SECTIONS = [
  { id: "introduction", title: "Introduction" },
  { id: "information-we-collect", title: "Information we collect" },
  { id: "third-party-services", title: "Third-party services" },
  { id: "security", title: "Security" },
  { id: "childrens-privacy", title: "Children's privacy" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact-us", title: "Contact us" },
];

/** Bandcoin's privacy policy, as published on bandfan. */
export function PrivacyView() {
  return (
    <PageBody className="grid max-w-3xl gap-6">
      <PageHeader title="Privacy policy" description="Effective date: March 12, 2024" />
      <p className="text-base leading-relaxed text-pretty">
        At Bandcoin, your privacy is our priority. This policy explains what information we collect,
        how it is used, and the rights you have as a user. By using Bandcoin&apos;s services, you
        agree to the collection and use of your data as described here.
      </p>

      <nav aria-label="Contents" className="bg-surface-2 rounded-xl p-4 text-sm">
        <p className="mb-2 font-semibold">Contents</p>
        <ol className="grid gap-1 sm:grid-cols-2">
          {SECTIONS.map((section, index) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-fg-muted hover:text-fg hover:underline">
                {index + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-4 [&>section]:scroll-mt-20">
        <section id="introduction">
          <InfoCard title="Introduction">
            <p>
              Bandcoin is a music platform that helps bands and artists connect with the Stellar
              blockchain. This policy governs how we collect, use and protect the information you
              give us when you use our services.
            </p>
          </InfoCard>
        </section>

        <section id="information-we-collect">
          <InfoCard title="Information we collect">
            <p className="text-fg font-semibold">1. Information you provide</p>
            <p>To improve your experience, we may collect personal information you provide:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Name</li>
              <li>Email address</li>
              <li>Gender</li>
              <li>Location</li>
              <li>Profile pictures</li>
              <li>Stellar address</li>
            </ul>
            <p>
              It is used to deliver and improve our services, kept securely, and shared only as this
              policy describes.
            </p>
            <p className="text-fg font-semibold">2. Cookies</p>
            <p>
              Cookies are small files stored on your device, often used to identify users
              anonymously. Bandcoin doesn&apos;t use cookies for tracking itself, but third-party
              tools in our services may use them. You can manage cookies in your browser settings;
              refusing them may limit some features.
            </p>
            <p className="text-fg font-semibold">3. Device information</p>
            <p>
              We may collect non-identifying information about your device (device type, operating
              system, app usage) to improve our services and prevent fraud.
            </p>
            <p className="text-fg font-semibold">4. Location</p>
            <p>
              Some services need your device&apos;s location. It is used only as far as the service
              needs and is not shared without your consent.
            </p>
          </InfoCard>
        </section>

        <section id="third-party-services">
          <InfoCard title="Third-party services">
            <p>
              Bandcoin may use trusted providers to run our services, analyse usage and do
              service-related tasks. They must protect your information and use it only for the
              purposes we allow.
            </p>
          </InfoCard>
        </section>

        <section id="security">
          <InfoCard title="Security">
            <p>
              We use commercially reasonable measures to protect your information. No online or
              electronic storage is completely secure, so we can&apos;t guarantee absolute security.
            </p>
          </InfoCard>
        </section>

        <section id="childrens-privacy">
          <InfoCard title="Children's privacy">
            <p>
              Bandcoin doesn&apos;t target or knowingly collect information from anyone under 13. If
              we learn we have, we delete it promptly. Parents or guardians who know of such a case
              should contact us straight away.
            </p>
          </InfoCard>
        </section>

        <section id="changes">
          <InfoCard title="Changes to this policy">
            <p>
              We may update this policy from time to time; changes appear on this page. Using our
              services after an update means you accept the revised policy.
            </p>
          </InfoCard>
        </section>

        <section id="contact-us">
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
        </section>
      </div>
    </PageBody>
  );
}
