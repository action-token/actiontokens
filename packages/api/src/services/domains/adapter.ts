import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { DomainHost } from "./host";
import { vercelHost } from "./vercel";

/** No host set up: custom domains say they aren't open yet, nothing half-works. */
export const manualHost: DomainHost = {
  name: "manual",
  available: false,
  add: () => Promise.reject(notOpen()),
  status: () => Promise.reject(notOpen()),
  remove: () => Promise.resolve(),
};

function notOpen() {
  return new AppError(ErrorCodes.CONFIG_MISSING, { message: "Custom domains aren't open yet." });
}

/**
 * The host from env: DOMAIN_HOST=vercel needs VERCEL_TOKEN and
 * VERCEL_PROJECT_ID (the fan app's project), VERCEL_TEAM_ID when the project
 * is in a team. Anything else, or a missing value, is the manual host.
 */
export function domainHostFromEnv(
  env: Record<string, string | undefined> = process.env,
): DomainHost {
  if (env.DOMAIN_HOST === "vercel" && env.VERCEL_TOKEN && env.VERCEL_PROJECT_ID) {
    return vercelHost({
      token: env.VERCEL_TOKEN,
      projectId: env.VERCEL_PROJECT_ID,
      // An empty VERCEL_TEAM_ID in the env file means "no team", so `||`, not `??`.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      teamId: env.VERCEL_TEAM_ID || undefined,
    });
  }
  return manualHost;
}
