/**
 * Action Tokens' social accounts and info pages, for the sidebar footers of the
 * fan app and the artist portal (the same ones bandfan's sidebar had).
 */

/* Brand marks lucide-react no longer ships. */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
      />
    </svg>
  );
}

export const SOCIALS = [
  { href: "https://www.facebook.com/actiontokens/", label: "Facebook", icon: FacebookIcon },
  { href: "https://www.instagram.com/actiontokens/", label: "Instagram", icon: InstagramIcon },
];

/** Info pages on the fan app; join with its base URL from another app. */
export const INFO_LINKS = [
  { path: "/about", label: "About" },
  { path: "/privacy", label: "Privacy" },
  { path: "/support", label: "Support" },
];

export const copyrightLine = (year = new Date().getFullYear()) => `© ${year} action-tokens.com`;
