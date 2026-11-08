import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";
import type {
  MarketSnapshot,
  TokenIdentity,
  VenueAdapter,
  VenueCapabilities,
} from "./types.js";

/** Subset of the Jupiter token payload that Bark actually uses. */
export interface JupiterToken {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  holderCount?: number;
  organicScore?: number;
  organicScoreLabel?: string;
  isVerified?: boolean;
  usdPrice?: number;
  mcap?: number;
  fdv?: number;
  liquidity?: number;
  createdAt?: string;
  audit?: {
    mintAuthorityDisabled?: boolean | null;
    freezeAuthorityDisabled?: boolean | null;
    topHoldersPercentage?: number;
  };
}

export interface JupiterVenueOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

function toIdentity(token: JupiterToken): TokenIdentity {
  return {
    mint: token.id,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    ...(token.icon === undefined ? {} : { logoUri: token.icon }),
    ...(token.isVerified === undefined ? {} : { verified: token.isVerified }),
  };
}

/**
 * Jupiter token API (lite tier).
 *
 * Verified working against lite-api.jup.ag on 2026-11-08. No key required for
 * the search endpoint, which returns holder counts, organic score and mint
 * audit flags - three signals the terminal needs on day one.
 */
export class JupiterVenue implements VenueAdapter {
  public readonly id = "jupiter";
  public readonly capabilities: VenueCapabilities = {
    markets: true,
    holders: false,
    trading: false,
    requiresCredentials: false,
  };

  private readonly client: JsonHttpClient;

  constructor(options: JupiterVenueOptions = {}) {
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? "https://lite-api.jup.ag",
      fetch: options.fetch,
    });
  }

  async search(query: string, limit = 20): Promise<TokenIdentity[]> {
    const tokens = await this.searchRaw(query, limit);
    return tokens.map(toIdentity);
  }

  async searchRaw(query: string, limit = 20): Promise<JupiterToken[]> {
    const results = await this.client.get<JupiterToken[]>("/tokens/v2/search", { query });
    return results.slice(0, limit);
  }

  async getToken(mint: string): Promise<TokenIdentity | null> {
    const tokens = await this.searchRaw(mint, 5);
    const match = tokens.find((token) => token.id === mint);
    return match === undefined ? null : toIdentity(match);
  }

  async getMarket(mint: string): Promise<MarketSnapshot | null> {
    const tokens = await this.searchRaw(mint, 5);
    const token = tokens.find((candidate) => candidate.id === mint);
    if (token === undefined) {
      return null;
    }
    return {
      mint,
      priceUsd: token.usdPrice ?? null,
      marketCapUsd: token.mcap ?? null,
      fdvUsd: token.fdv ?? null,
      liquidityUsd: token.liquidity ?? null,
      volume24hUsd: null,
      priceChange24h: null,
      observedAt: Date.now(),
      source: "jupiter",
    };
  }
}
