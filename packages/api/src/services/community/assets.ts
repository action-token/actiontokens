import { stellarNetwork } from "@actiontokens/wallet/config";

export type AssetHit = {
  assetCode: string;
  assetIssuer: string;
  assetImageUrl: string | null;
  name: string | null;
  org: string | null;
  trustlines: number;
};

type Record = {
  asset: string;
  tomlInfo?: { image?: string; name?: string; orgName?: string };
  trustlines?: { funded?: number };
};

/**
 * Looks assets up on stellar.expert for the gate's token picker. The explorer is a convenience, so
 * any failure is an empty list rather than an error. Native XLM has no issuer and is left out.
 */
export async function searchAssets(
  search: string,
  fetcher: typeof fetch = fetch,
): Promise<AssetHit[]> {
  const network = stellarNetwork.isMainnet ? "public" : "testnet";
  const url = `https://api.stellar.expert/explorer/${network}/asset?search=${encodeURIComponent(search)}&limit=20`;
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const body = (await response.json()) as { _embedded?: { records?: Record[] } };
    return (body._embedded?.records ?? []).flatMap((record) => {
      const [code, issuer] = record.asset.split("-");
      if (!code || !issuer) return [];
      return [
        {
          assetCode: code,
          assetIssuer: issuer,
          assetImageUrl: record.tomlInfo?.image ?? null,
          name: record.tomlInfo?.name ?? null,
          org: record.tomlInfo?.orgName ?? null,
          trustlines: record.trustlines?.funded ?? 0,
        },
      ];
    });
  } catch {
    return [];
  }
}
