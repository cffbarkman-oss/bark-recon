/**
 * The normalized vocabulary every venue adapter speaks.
 *
 * Bark's terminal should not know which provider a number came from, but it
 * must always be able to tell the user. Hence "source" on every snapshot.
 */

export interface TokenIdentity {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  verified?: boolean;
}

export interface MarketSnapshot {
  mint: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24h: number | null;
  observedAt: number;
  source: string;
}

export interface VenueCapabilities {
  /** Can list / search tokens. */
  markets: boolean;
  /** Can return holder distribution. */
  holders: boolean;
  /** Can place orders. */
  trading: boolean;
  /** Needs an API key or partnership before it returns data. */
  requiresCredentials: boolean;
}

export interface VenueAdapter {
  readonly id: string;
  readonly capabilities: VenueCapabilities;
  search(query: string, limit?: number): Promise<TokenIdentity[]>;
  getToken(mint: string): Promise<TokenIdentity | null>;
  getMarket?(mint: string): Promise<MarketSnapshot | null>;
}

export class VenueAuthRequiredError extends Error {
  public override readonly name = "VenueAuthRequiredError";
  public readonly venue: string;

  constructor(venue: string, message?: string) {
    super(message ?? venue + " requires credentials before it will return data");
    this.venue = venue;
  }
}

export class VenueUnavailableError extends Error {
  public override readonly name = "VenueUnavailableError";
  public readonly venue: string;

  constructor(venue: string, message?: string) {
    super(message ?? venue + " is not reachable from this integration");
    this.venue = venue;
  }
}
