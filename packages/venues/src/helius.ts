import { SolanaRpc, type FetchLike } from "@bark/solana";
import { VenueAuthRequiredError } from "./types.js";

/**
 * Helius: managed Solana RPC, DAS asset queries and transaction sending.
 *
 * Verified behaviour on 2026-11-08: https://mainnet.helius-rpc.com/ without a
 * key answers 401 Unauthorized. The adapter wraps a SolanaRpc instance so the
 * whole decoding stack in this repo works unchanged against a Helius endpoint -
 * which is the point: provider boundaries stay in one place.
 *
 * DAS (Digital Asset Standard) is the piece a plain RPC cannot do: fetching
 * token metadata, authorities and ownership in one call instead of an N+1 walk.
 */

export interface HeliusOptions {
  apiKey?: string;
  /** Override for devnet or a dedicated cluster. */
  baseUrl?: string;
  fetch?: FetchLike;
}

export interface DasAsset {
  id: string;
  interface: string;
  authorities: Array<{ address: string; scopes: string[] }>;
  ownership: { owner?: string; delegate?: string; frozen: boolean; delegated: boolean };
  content?: { metadata?: { name?: string; symbol?: string }; links?: Record<string, string> };
  tokenInfo?: {
    symbol?: string;
    supply?: string;
    decimals?: number;
    tokenProgram?: string;
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
  };
  mutable: boolean;
  burnt: boolean;
}

export class HeliusVenue {
  public readonly id = "helius";

  public readonly rpc: SolanaRpc;
  private readonly endpoint: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: HeliusOptions = {}) {
    const apiKey = options.apiKey;
    if (apiKey === undefined || apiKey.length === 0) {
      throw new VenueAuthRequiredError(
        "helius",
        "Helius requires an api-key query parameter; unauthenticated requests return 401",
      );
    }
    this.endpoint = (options.baseUrl ?? "https://mainnet.helius-rpc.com") + "/?api-key=" + apiKey;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.rpc = new SolanaRpc({ endpoint: this.endpoint, fetch: this.fetchImpl });
  }

  /** DAS: fetch one or more assets by mint address. */
  async getAssets(ids: string[]): Promise<DasAsset[]> {
    if (ids.length === 0) {
      return [];
    }
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "bark-das", method: "getAssetBatch", params: { ids } }),
    });
    const payload = (await response.json()) as { result?: DasAsset[]; error?: { message?: string } };
    if (payload.error !== undefined) {
      throw new Error("Helius DAS error: " + (payload.error.message ?? "unknown"));
    }
    return payload.result ?? [];
  }

  /** DAS: assets owned by a wallet, capped by the caller. */
  async getAssetsByOwner(owner: string, limit = 100): Promise<DasAsset[]> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bark-das-owner",
        method: "getAssetsByOwner",
        params: { ownerAddress: owner, page: 1, limit },
      }),
    });
    const payload = (await response.json()) as {
      result?: { items?: DasAsset[] };
      error?: { message?: string };
    };
    if (payload.error !== undefined) {
      throw new Error("Helius DAS error: " + (payload.error.message ?? "unknown"));
    }
    return payload.result?.items ?? [];
  }
}
