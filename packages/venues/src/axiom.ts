import {
  VenueUnavailableError,
  type MarketSnapshot,
  type TokenIdentity,
  type VenueAdapter,
  type VenueCapabilities,
} from "./types.js";

/**
 * Axiom (axiom.trade).
 *
 * Recon result (2026-11-08): every request - including the marketing page -
 * returned HTTP 403 behind a managed challenge from this network, and the
 * origin did not resolve for a direct fetch. There is therefore no evidence in
 * this repository about Axiom's internal request surface, and none is invented.
 *
 * What Axiom does publicly is a trading terminal over Solana liquidity with
 * its own routing and social features. If Bark wants to integrate, the path is
 * a partnership or a licensed data provider - not scraping.
 *
 * This descriptor exists so the venue registry can report accurate capability
 * state to the product, instead of silently omitting a competitor.
 */

export class AxiomVenue implements VenueAdapter {
  public readonly id = "axiom";
  public readonly capabilities: VenueCapabilities = {
    markets: false,
    holders: false,
    trading: false,
    requiresCredentials: true,
  };

  async search(_query: string, _limit?: number): Promise<TokenIdentity[]> {
    throw new VenueUnavailableError(
      this.id,
      "axiom.trade is not reachable for integration; no API surface was observed",
    );
  }

  async getToken(_mint: string): Promise<TokenIdentity | null> {
    throw new VenueUnavailableError(
      this.id,
      "axiom.trade is not reachable for integration; no API surface was observed",
    );
  }

  async getMarket(_mint: string): Promise<MarketSnapshot | null> {
    throw new VenueUnavailableError(
      this.id,
      "axiom.trade is not reachable for integration; no API surface was observed",
    );
  }
}
