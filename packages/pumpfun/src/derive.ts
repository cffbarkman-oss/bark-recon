import { PublicKey, findProgramAddress, type ProgramAddress } from "@bark/solana";
import { BONDING_CURVE_SEED, PUMP_PROGRAM_ID } from "./programs.js";

/**
 * Bonding-curve address derivation.
 *
 * Seeds: ("bonding-curve", mint) under the pump program.
 *
 * Verified against a live launch captured on 2026-11-08: deriving from the
 * mint in the CreateEvent reproduces the bonding_curve field byte for byte
 * (bump 255). The PDA implementation itself is validated independently against
 * a real associated token account, so a match here is meaningful.
 *
 * Caveat worth carrying: not every historical curve reproduces this way. One
 * curve account sampled from a 2026-11-08 sell is not derivable from its mint
 * under this seed set, nor under 384 other seed/provider combinations tried.
 * Derive for current launches, but always confirm the account exists before
 * trusting the address - and prefer indexing addresses that appear in
 * transactions over recomputing them.
 */
export function deriveBondingCurveAddress(mint: PublicKey | string): ProgramAddress {
  const key = mint instanceof PublicKey ? mint : new PublicKey(mint);
  return findProgramAddress(
    [new TextEncoder().encode(BONDING_CURVE_SEED), key.toBytes()],
    PUMP_PROGRAM_ID,
  );
}
