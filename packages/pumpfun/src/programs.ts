import { PublicKey } from "@bark/solana";

/**
 * pump.fun program constants.
 *
 * Names and offsets follow the Anchor IDL published in @pump-fun/pump-sdk
 * 4.3.1 (MIT). Every constant here was then re-derived from mainnet bytes:
 * account lengths, event lengths and fee arithmetic all land exactly on the
 * IDL layout, which is why this file no longer carries "docs" guesses.
 *
 * What the cross-check bought us:
 *   - discriminators verified end to end (create_v2, buy_v2, sell, tradeEvent)
 *   - the fee slot in TradeEvent re-identified (fee_basis_points, not fee)
 *   - the 166-byte BondingCurve decoded in full, including quote-mint support
 */

/** The bonding-curve program. Owns curve accounts. */
export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

/** Fee program invoked as a CPI on every trade. Observed, not in the pump IDL. */
export const PUMP_FEE_PROGRAM_ID = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

/** Router the current frontend uses; CPIs into PUMP_PROGRAM_ID. */
export const PUMP_ROUTER_PROGRAM_ID = new PublicKey("m9obQHAPyZeZ88w7XUY8Te6a8rBmhXsfKco7u8G8tnB");

/** Token program used by current launches (Token-2022). */
export const PUMP_TOKEN_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** Singleton configuration account, 1088 bytes, owner = PUMP_PROGRAM_ID. */
export const PUMP_GLOBAL_ACCOUNT = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

/** Global fee recipient observed in the global account and in TradeEvents. */
export const PUMP_FEE_RECIPIENT = new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");

/** Anchor event authority used by emit_cpi instructions. */
export const PUMP_EVENT_AUTHORITY = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

/** Seed prefix for a bonding-curve PDA (classic namespace). */
export const BONDING_CURVE_SEED = "bonding-curve";

export type PumpAction = "create" | "buy" | "sell" | "migrate" | "complete";

/**
 * Anchor discriminators, hex encoded.
 *
 * Source: IDL 4.3.1, confirmed against mainnet transaction and account data
 * captured in docs/evidence.
 */
export const DISCRIMINATORS = {
  // accounts
  bondingCurveAccount: "17b7f83760d8ac60",
  globalAccount: "a7e8e8b1c86c727f",
  feeConfigAccount: "8f3492bbdb7b4c9b",
  quoteControlAccount: "38f423eec1d5a2c9",

  // instructions
  create: "181ec828051c0777",
  createV2: "d6904cec5f8b31b4",
  buy: "66063d1201daebea",
  buyV2: "b817ee6167c5d33d",
  buyExactSolIn: "38fc74089edfcd5f",
  sell: "33e685a4017f83ad",
  sellV2: "5df6823ce7e940b2",
  migrate: "9beae792ec9ea21e",
  migrateV2: "bbcb121fceedfe29",
  collectCreatorFee: "1416567bc61cdb84",

  // events
  tradeEvent: "bddb7fd34ee661ee",
  createEvent: "1b72a94ddeeb6376",
  completeEvent: "5f72619cd42e9808",
  collectCreatorFeeEvent: "7a027f010ebf0caf",

  // framework
  eventCpi: "e445a52e51cb9a1d",
} as const;

export type DiscriminatorName = keyof typeof DISCRIMINATORS;

/** Decodes a hex discriminator into its 8 raw bytes. */
export function hexToDiscriminator(hex: string): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

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

/** Instruction names as they appear in logs. */
export const PROGRAM_LOGS = {
  create: "Instruction: Create",
  createV2: "Instruction: CreateV2",
  buy: "Instruction: Buy",
  buyV2: "Instruction: BuyV2",
  sell: "Instruction: Sell",
  sellV2: "Instruction: SellV2",
  routerBuy: "Instruction: PumpBondingCurveBuy",
  routerSell: "Instruction: PumpBondingCurveSell",
} as const;
