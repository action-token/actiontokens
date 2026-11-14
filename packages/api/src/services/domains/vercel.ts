import { type DnsRecord, type DomainHost, DomainHostError } from "./host";

/**
 * Custom domains on the fan app's Vercel project (plan 32), through Vercel's
 * REST API: add / get / verify / remove a project domain, and a domain's DNS
 * configuration. Records shown to the artist always come from Vercel's
 * answers, never from fixed values.
 */
export type VercelOptions = {
  token: string;
  /** The fan app's project id or name */
  projectId: string;
  teamId?: string;
  fetch?: typeof fetch;
};

type ProjectDomain = {
  name: string;
  apexName: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};

type DomainConfig = {
  misconfigured: boolean;
  recommendedIPv4?: { rank: number; value: string[] }[];
  recommendedCNAME?: { rank: number; value: string }[];
};

const API = "https://api.vercel.com";

const preferred = <T extends { rank: number }>(list: T[] | undefined) =>
  [...(list ?? [])].sort((a, b) => a.rank - b.rank)[0];

export function vercelHost(options: VercelOptions): DomainHost {
  const send = options.fetch ?? fetch;
  const project = encodeURIComponent(options.projectId);

  async function call<T>(
    method: string,
    path: string,
    query: Record<string, string> = {},
    body?: unknown,
  ) {
    const params = new URLSearchParams(query);
    if (options.teamId) params.set("teamId", options.teamId);
    const qs = params.toString();
    const response = await send(`${API}${path}${qs ? `?${qs}` : ""}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    } & T;
    if (!response.ok) {
      throw new DomainHostError(
        json.error?.message ?? `Vercel answered ${response.status}`,
        response.status,
      );
    }
    return json as T;
  }

  const domainPath = (domain: string) =>
    `/v9/projects/${project}/domains/${encodeURIComponent(domain)}`;

  /** Ownership records Vercel asks for, and the record pointing a name at Vercel. */
  function recordsFor(domain: ProjectDomain, config: DomainConfig, withWww: boolean): DnsRecord[] {
    const records: DnsRecord[] = (domain.verified ? [] : (domain.verification ?? [])).map(
      (entry) => ({
        type: entry.type,
        name: entry.domain,
        value: entry.value,
        purpose: "ownership",
      }),
    );
    const isRoot = domain.name === domain.apexName;
    const ip = preferred(config.recommendedIPv4)?.value[0];
    const cname = preferred(config.recommendedCNAME)?.value.replace(/\.$/, "");
    if (isRoot && ip) records.push({ type: "A", name: domain.name, value: ip, purpose: "point" });
    if (!isRoot && cname) {
      records.push({ type: "CNAME", name: domain.name, value: cname, purpose: "point" });
    }
    if (isRoot && withWww && cname) {
      records.push({ type: "CNAME", name: `www.${domain.name}`, value: cname, purpose: "point" });
    }
    return records;
  }

  return {
    name: "vercel",
    available: true,

    async add(domain) {
      const added = await call<ProjectDomain>(
        "POST",
        `/v10/projects/${project}/domains`,
        {},
        {
          name: domain,
        },
      );
      if (added.apexName !== domain) return { withWww: false };
      try {
        await call(
          "POST",
          `/v10/projects/${project}/domains`,
          {},
          {
            name: `www.${domain}`,
            redirect: domain,
            redirectStatusCode: 308,
          },
        );
      } catch (error) {
        // Never leave the root attached without its www: undo, then report.
        await call("DELETE", domainPath(domain), {}, { removeRedirects: true }).catch(() => null);
        throw error;
      }
      return { withWww: true };
    },

    async status(domain, { withWww }) {
      let current: ProjectDomain;
      try {
        current = await call<ProjectDomain>("GET", domainPath(domain));
      } catch (error) {
        if (error instanceof DomainHostError && error.status === 404) {
          return {
            found: false,
            verified: false,
            configured: false,
            records: [],
            error: "The domain isn't on the host any more.",
          };
        }
        throw error;
      }
      let problem: string | null = null;
      if (!current.verified) {
        // Ask Vercel to look again; its refusal says what's missing.
        try {
          const checked = await call<{ verified: boolean }>("POST", `${domainPath(domain)}/verify`);
          current = { ...current, verified: checked.verified };
        } catch (error) {
          if (!(error instanceof DomainHostError) || error.status !== 400) throw error;
          problem = error.message;
        }
      }
      const config = await call<DomainConfig>(
        "GET",
        `/v6/domains/${encodeURIComponent(domain)}/config`,
        { projectIdOrName: options.projectId },
      );
      const configured = !config.misconfigured;
      if (!problem && !configured) problem = "The DNS records aren't pointing at Bandcoin yet.";
      return {
        found: true,
        verified: current.verified,
        configured,
        records: recordsFor(current, config, withWww),
        error: current.verified && configured ? null : problem,
      };
    },

    async remove(domain) {
      try {
        await call("DELETE", domainPath(domain), {}, { removeRedirects: true });
      } catch (error) {
        if (error instanceof DomainHostError && error.status === 404) return;
        throw error;
      }
    },
  };
}
