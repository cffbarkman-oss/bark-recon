/**
 * Wire types for the Solana JSON-RPC surface this repository actually uses.
 *
 * They describe the shapes returned with encoding "jsonParsed", which is what
 * the parsers in @bark/pumpfun consume. Fields the RPC omits are optional so
 * that fixtures recorded from different clusters keep type-checking.
 */

export interface RpcAccountInfo {
  data: [string, string];
  executable: boolean;
  lamports: number;
  owner: string;
  rentEpoch: number;
  space?: number;
}

export interface RpcContext {
  slot: number;
}

export interface RpcValueResponse<T> {
  context: RpcContext;
  value: T;
}

export interface RpcAccountKey {
  pubkey: string;
  signer?: boolean;
  writable?: boolean;
  source?: string;
}

export interface RpcInstruction {
  programId?: string;
  program?: string;
  accounts?: string[];
  data?: string;
  parsed?: unknown;
  stackHeight?: number | null;
}

export interface RpcInnerInstructionGroup {
  index: number;
  instructions: RpcInstruction[];
}

export interface RpcTokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

export interface RpcTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: RpcTokenAmount;
}

export interface RpcLoadedAddresses {
  readonly: string[];
  writable: string[];
}

export interface RpcTransactionMeta {
  err: unknown;
  fee: number;
  innerInstructions?: RpcInnerInstructionGroup[] | null;
  loadedAddresses?: RpcLoadedAddresses;
  logMessages?: string[] | null;
  postBalances: number[];
  postTokenBalances?: RpcTokenBalance[] | null;
  preBalances: number[];
  preTokenBalances?: RpcTokenBalance[] | null;
  rewards?: unknown[] | null;
  computeUnitsConsumed?: number | null;
}

export interface RpcMessage {
  accountKeys: RpcAccountKey[];
  instructions: RpcInstruction[];
  recentBlockhash?: string;
}

export interface RpcTransaction {
  slot: number;
  blockTime?: number | null;
  meta: RpcTransactionMeta | null;
  transaction: {
    message: RpcMessage;
    signatures: string[];
  };
  version?: number | string;
}

export interface RpcSignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  memo?: string | null;
  blockTime?: number | null;
  confirmationStatus?: "processed" | "confirmed" | "finalized";
}

export interface RpcTokenLargestAccount {
  address: string;
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

export interface RpcTokenSupply {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

export interface RpcBlockhash {
  blockhash: string;
  lastValidBlockHeight: number;
}
