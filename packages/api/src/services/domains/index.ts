export { domainHostFromEnv, manualHost } from "./adapter";
export { type DnsRecord, type DomainHost, DomainHostError, type HostDomainStatus } from "./host";
export { normalizeDomain, validateDomain } from "@bandcoin/utils/domain";
export { describeDomain, domainKey, parseDomainKey } from "./notice";
export {
  addDomain,
  checkDomains,
  getDomain,
  listDomainsForAdmin,
  liveDomainArtist,
  reconnectDomain,
  refreshDomain,
  removeDomain,
  removeDomainAsAdmin,
} from "./service";
