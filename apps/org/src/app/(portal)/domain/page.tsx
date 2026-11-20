import { permanentRedirect } from "next/navigation";

/** The short link moved into Settings. */
export default function DomainPage() {
  permanentRedirect("/settings?tab=short-link");
}
