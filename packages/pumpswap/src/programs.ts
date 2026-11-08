import { PublicKey } from "@bark/solana";

/**
 * PumpSwap: the AMM every graduated pump.fun token migrates into.
 *
 * Addresses and discriminators come from the Anchor IDL in
 * @pump-fun/pump-sdk 4.3.1 (pump_amm.json, MIT), confirmed against a live pool
 * and a live swap captured on 2026-11-08.
 *
 * Discriminator collision warning: pump and pump_amm use IDENTICAL
 * discriminators for buy, sell, buy_v2, sell_v2 and for the BondingCurve and
 * FeeConfig accounts. A discriminator alone cannot tell you which program you
 * are looking at - the owning program is the only disambiguator. Any indexer
 * that switches on the first eight bytes without checking the owner will
 * confuse a bonding curve with an AMM pool.
 */

export const PUMPSWAP_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

export const DISCRIMINATORS = {
  // accounts
  pool: "f19a6d0411b16dbc",
  globalConfig: "95089ccaa0fcb0d9",
  feeConfig: "8f3492bbdb7b4c9b",
  bondingCurve: "17b7f83760d8ac60",

  // instructions
  buy: "66063d1201daebea",
  buyV2: "b817ee6167c5d33d",
  buyExactQuoteIn: "c62e1552b4d9e870",
  sell: "33e685a4017f83ad",
  sellV2: "5df6823ce7e940b2",
  createPool: "e992d18ecf6840bc",
  deposit: "f223c68952e1f2b6",
  withdraw: "b712469c946da122",

  // events
  buyEvent: "67f4521f2cf57777",
  sellEvent: "3e2f370aa503dc2a",
  createPoolEvent: "b1310cd2a076a774",
  depositEvent: "78f83d531f8e6b90",
  withdrawEvent: "1609851aa02c47c0",

  // framework
  eventCpi: "e445a52e51cb9a1d",
} as const;

/** Fee configuration observed on a live swap: 20 / 5 / 75 bps. */
export const OBSERVED_FEES = {
  lpFeeBps: 20,
  protocolFeeBps: 5,
  coinCreatorFeeBps: 75,
} as const;

export function matchesDiscriminator(data: Uint8Array, hex: string): boolean {
  if (data.length < 8) {
    return false;
  }
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)) {
      return false;
    }
  }
  return true;
}
