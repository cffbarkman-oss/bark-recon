import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";
import {
  VenueAuthRequiredError,
  type TokenIdentity,
  type VenueAdapter,
  type VenueCapabilities,
} from "./types.js";

/**
 * fomo.family.
 *
 * Recon result (2026-11-08):
 *   - The site is a Remix app served from fomo.family; the marketing bundle is
 *     public and was read in full.
 *   - Data requests go to evm-data.prod-edge.fomo.family.
 *   - Every unauthenticated request to that host returns HTTP 401 with
 *     {"error":"unauthorized","message":"no_auth_header"} - including /health.
 *     The service expects a bearer credential minted by the app session.
 *
 * fomo is multi-chain, not Solana-only. Chains reachable from the public
 * bundle include Base, Monad, Robinhood Chain and Arc. Its Solana coverage
 * rides on pump.fun-style curves rather than its own program.
 *
 * No credential bypass is shipped here by design: Bark should integrate under
 * an agreement, not by impersonating a browser session.
 */

export const FOMO_DATA_HOST = "https://evm-data.prod-edge.fomo.family";

export interface FomoVenueOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export class FomoVenue implements VenueAdapter {
  public readonly id = "fomo";
  public readonly capabilities: VenueCapabilities = {
    markets: true,
    holders: false,
    trading: false,
    requiresCredentials: true,
  };

  private readonly apiKey: string | undefined;
  private readonly client: JsonHttpClient;

  constructor(options: FomoVenueOptions = {}) {
    this.apiKey = options.apiKey;
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? FOMO_DATA_HOST,
      fetch: options.fetch,
    });
  }

  private requireKey(): string {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new VenueAuthRequiredError(
        this.id,
        "fomo data API rejects requests without an authorization header (HTTP 401 no_auth_header)",
      );
    }
    return this.apiKey;
  }

  async search(query: string, limit = 20): Promise<TokenIdentity[]> {
    const key = this.requireKey();
    const response = await this.client.get<unknown>("/v1/search", { q: query, limit }, {
      authorization: "Bearer " + key,
    });
    const rows = Array.isArray(response) ? response : [];
    return rows.slice(0, limit).map((row) => toIdentity(row));
  }

  async getToken(mint: string): Promise<TokenIdentity | null> {
    const key = this.requireKey();
    const response = await this.client.get<unknown>("/v1/tokens/" + mint, undefined, {
      authorization: "Bearer " + key,
    });
    return response === null ? null : toIdentity(response);
  }
}

function toIdentity(value: unknown): TokenIdentity {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    mint: typeof record.address === "string" ? record.address : String(record.mint ?? ""),
    symbol: typeof record.symbol === "string" ? record.symbol : "",
    name: typeof record.name === "string" ? record.name : "",
    decimals: typeof record.decimals === "number" ? record.decimals : 6,
  };
}
