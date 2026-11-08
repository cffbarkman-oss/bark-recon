import { decodeBase58 } from "./base58.js";
import type { RpcAccountInfo } from "./types.js";

/**
 * Decodes the payload of an RPC account, honouring the encoding tag the node
 * reports. Nodes may answer with base64 even when base58 was requested, so the
 * tag is authoritative and the payload must never be assumed.
 */
export function decodeAccountData(account: RpcAccountInfo): Uint8Array {
  const [payload, encoding] = account.data;
  if (encoding === "base64") {
    return new Uint8Array(Buffer.from(payload, "base64"));
  }
  if (encoding === "base58") {
    return decodeBase58(payload);
  }
  throw new Error("Unsupported account encoding: " + String(encoding));
}
