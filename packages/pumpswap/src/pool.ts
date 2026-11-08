import { ByteReader, PublicKey } from "@bark/solana";
import { DISCRIMINATORS, matchesDiscriminator } from "./programs.js";

/**
 * Pool account decoder.
 *
 * The IDL fields consume 279 bytes; live accounts are 301, leaving 14 bytes
 * unmapped at the tail. They are preserved verbatim rather than guessed at,
 * the same rule used for the pump.fun TradeEvent tail.
 *
 * Note that Pool does not store reserves: base and quote balances live in the
 * two token accounts it points at. Pricing reads those accounts, never this
 * struct.
 */

export const POOL_DECODED_LENGTH = 287;
export const POOL_OBSERVED_LENGTH = 301;

export interface Pool {
  address: PublicKey;
  poolBump: number;
  index: number;
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  lpMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
  lpSupply: bigint;
  coinCreator: PublicKey;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  virtualQuoteReserves: bigint;
  creatorFeeBps: bigint;
  canEditCreatorFee: boolean;
  isHolderReward: boolean;
  protocolFees: bigint;
  creatorFees: bigint;
  trailing: Uint8Array;
}

export class PoolDecodeError extends Error {
  public override readonly name = "PoolDecodeError";
}

export function decodePool(address: PublicKey | string, data: Uint8Array): Pool {
  if (!matchesDiscriminator(data, DISCRIMINATORS.pool)) {
    throw new PoolDecodeError("Not a PumpSwap pool account");
  }

  const reader = new ByteReader(data);
  reader.skip(8);

  const pool: Pool = {
    address: new PublicKey(address),
    poolBump: reader.u8(),
    index: reader.u16(),
    creator: new PublicKey(reader.bytes(32)),
    baseMint: new PublicKey(reader.bytes(32)),
    quoteMint: new PublicKey(reader.bytes(32)),
    lpMint: new PublicKey(reader.bytes(32)),
    poolBaseTokenAccount: new PublicKey(reader.bytes(32)),
    poolQuoteTokenAccount: new PublicKey(reader.bytes(32)),
    lpSupply: reader.u64(),
    coinCreator: new PublicKey(reader.bytes(32)),
    isMayhemMode: reader.bool(),
    isCashbackCoin: reader.bool(),
    virtualQuoteReserves: reader.i128(),
    creatorFeeBps: reader.u64(),
    canEditCreatorFee: reader.bool(),
    isHolderReward: reader.bool(),
    protocolFees: reader.u64(),
    creatorFees: reader.u64(),
    trailing: new Uint8Array(0),
  };

  pool.trailing = reader.rest();
  return pool;
}
