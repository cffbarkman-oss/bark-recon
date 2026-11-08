import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";
import type {
  MarketSnapshot,
  TokenIdentity,
  VenueAdapter,
  VenueCapabilities,
} from "./types.js";

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  pairCreatedAt?: number;
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

function bestPair(pairs: DexScreenerPair[]): DexScreenerPair | null {
  let best: DexScreenerPair | null = null;
  for (const pair of pairs) {
    if (pair.chainId !== "solana") {
      continue;
    }
    if (best === null || (pair.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0)) {
      best = pair;
    }
  }
  return best;
}

function toSnapshot(mint: string, pair: DexScreenerPair): MarketSnapshot {
  return {
    mint,
    priceUsd: pair.priceUsd === undefined ? null : Number(pair.priceUsd),
    marketCapUsd: pair.marketCap ?? null,
    fdvUsd: pair.fdv ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
    priceChange24h: pair.priceChange?.h24 ?? null,
    observedAt: Date.now(),
    source: "dexscreener",
  };
}

/**
 * DexScreener pair data.
 *
 * Verified against api.dexscreener.com on 2026-11-08. Returns one row per DEX
 * pair, so the adapter picks the deepest Solana pair rather than averaging
 * across venues.
 */
export class DexScreenerVenue implements VenueAdapter {
  public readonly id = "dexscreener";
  public readonly capabilities: VenueCapabilities = {
    markets: true,
    holders: false,
    trading: false,
    requiresCredentials: false,
  };

  private readonly client: JsonHttpClient;

  constructor(options: { baseUrl?: string; fetch?: FetchLike } = {}) {
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? "https://api.dexscreener.com",
      fetch: options.fetch,
    });
  }

  async getPairs(mint: string): Promise<DexScreenerPair[]> {
    const response = await this.client.get<DexScreenerResponse>("/latest/dex/tokens/" + mint);
    return response.pairs ?? [];
  }

  async search(query: string): Promise<TokenIdentity[]> {
    const response = await this.client.get<DexScreenerResponse>("/latest/dex/search", { q: query });
    const seen = new Set<string>();
    const out: TokenIdentity[] = [];
    for (const pair of response.pairs ?? []) {
      if (pair.chainId !== "solana" || seen.has(pair.baseToken.address)) {
        continue;
      }
      seen.add(pair.baseToken.address);
      out.push({
        mint: pair.baseToken.address,
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        decimals: 0,
      });
    }
    return out;
  }

  async getToken(mint: string): Promise<TokenIdentity | null> {
    const pairs = await this.getPairs(mint);
    const pair = bestPair(pairs);
    if (pair === null) {
      return null;
    }
    return {
      mint,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      decimals: 0,
    };
  }

  async getMarket(mint: string): Promise<MarketSnapshot | null> {
    const pair = bestPair(await this.getPairs(mint));
    return pair === null ? null : toSnapshot(mint, pair);
  }
}
