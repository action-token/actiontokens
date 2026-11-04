export function legacyRedirects(origins: { portal: string; ar: string }): {
  source: string;
  destination: string;
  permanent: boolean;
}[];
