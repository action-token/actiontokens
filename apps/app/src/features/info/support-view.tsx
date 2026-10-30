import { Bug, LifeBuoy, Megaphone, Wallet } from "lucide-react";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

const CONTACTS = [
  { icon: LifeBuoy, title: "Technical support", email: "support@bandcoin.io" },
  { icon: Wallet, title: "Sales questions", email: "sales@bandcoin.io" },
  { icon: Megaphone, title: "Press", email: "press@bandcoin.io" },
  { icon: Bug, title: "Bug report", email: "bugs@bandcoin.io" },
];

/** Who to write to (bandfan's Support page; its contact form needs an email service, not set up yet). */
export function SupportView() {
  return (
    <PageBody className="grid max-w-3xl gap-6">
      <PageHeader title="Support" note="*we're here to help*" />
      <p className="text-base text-pretty">
        Write to the right team and we&apos;ll get back to you. Tell us your username or wallet
        address so we can find your account.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CONTACTS.map((contact) => (
          <li key={contact.email}>
            <a
              href={`mailto:${contact.email}`}
              className="bg-surface border-fg/10 hover:border-fg/30 flex items-center gap-3 rounded-[1.2rem] border-2 p-4 transition-colors"
            >
              <span className="bg-primary-soft text-primary-text flex size-10 shrink-0 items-center justify-center rounded-xl">
                <contact.icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{contact.title}</span>
                <span className="text-fg-muted block truncate text-sm">{contact.email}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </PageBody>
  );
}
