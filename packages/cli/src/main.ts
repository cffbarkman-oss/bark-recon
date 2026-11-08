#!/usr/bin/env node
import { SolanaRpc, decodeAccountData } from "@bark/solana";
import {
  decodeBondingCurve,
  deriveBondingCurveAddress,
  matchesDiscriminator,
  DISCRIMINATORS,
  parsePumpTransaction,
  reconcileTrade,
  type BondingCurveAccount,
} from "@bark/pumpfun";
import { renderCurve, renderTransaction } from "./render.js";

const USAGE = [
  "bark-recon - inspect pump.fun activity on Solana",
  "",
  "Usage:",
  "  bark-recon capture <signature> [--rpc <url>] [--json]",
  "  bark-recon curve <mint-or-curve-address> [--rpc <url>] [--json]",
  "",
  "Environment:",
  "  SOLANA_RPC_URL   endpoint to use when --rpc is omitted",
  "",
  "Exit codes: 0 ok, 1 request failed, 2 usage error",
].join(String.fromCharCode(10));

interface Args {
  command: string;
  target: string;
  rpcUrl: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let rpcUrl = process.env.SOLANA_RPC_URL ?? "";
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--rpc") {
      rpcUrl = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      positional.push("help");
      continue;
    }
    positional.push(arg);
  }

  return {
    command: positional[0] ?? "help",
    target: positional[1] ?? "",
    rpcUrl,
    json,
  };
}

function fail(message: string, code: number): never {
  process.stderr.write(message + String.fromCharCode(10));
  process.exit(code);
}

async function runCapture(rpc: SolanaRpc, signature: string, json: boolean): Promise<void> {
  const transaction = await rpc.getTransaction(signature);
  if (transaction === null) {
    fail("transaction not found: " + signature, 1);
  }
  const parsed = parsePumpTransaction(transaction);
  const settlements = parsed.trades.map((trade) => reconcileTrade(trade, transaction));

  if (json) {
    process.stdout.write(JSON.stringify({ parsed, settlements }, null, 2) + String.fromCharCode(10));
    return;
  }
  process.stdout.write(renderTransaction(parsed, settlements) + String.fromCharCode(10));
}

async function loadCurve(
  rpc: SolanaRpc,
  argument: string,
): Promise<BondingCurveAccount> {
  const direct = await rpc.getAccountInfo(argument);
  if (direct !== null) {
    const data = decodeAccountData(direct);
    if (matchesDiscriminator(data, DISCRIMINATORS.bondingCurveAccount)) {
      return decodeBondingCurve(argument, data);
    }
  }

  const derived = deriveBondingCurveAddress(argument);
  const account = await rpc.getAccountInfo(derived.address.toBase58());
  if (account === null) {
    fail(
      "no bonding curve found for " + argument +
        " (also tried derived address " + derived.address.toBase58() + ")",
      1,
    );
  }
  return decodeBondingCurve(derived.address.toBase58(), decodeAccountData(account));
}

async function runCurve(rpc: SolanaRpc, target: string, json: boolean): Promise<void> {
  const curve = await loadCurve(rpc, target);
  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          address: curve.address.toBase58(),
          layout: curve.layout,
          complete: curve.complete,
          virtualTokenReserves: curve.virtualTokenReserves.toString(),
          virtualQuoteReserves: curve.virtualQuoteReserves.toString(),
          realTokenReserves: curve.realTokenReserves.toString(),
          realQuoteReserves: curve.realQuoteReserves.toString(),
          creator: curve.creator === null ? null : curve.creator.toBase58(),
        },
        null,
        2,
      ) + String.fromCharCode(10),
    );
    return;
  }
  process.stdout.write(renderCurve(curve) + String.fromCharCode(10));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help" || args.target.length === 0) {
    process.stdout.write(USAGE + String.fromCharCode(10));
    if (args.command !== "help") {
      process.exit(2);
    }
    return;
  }

  const rpcUrl = args.rpcUrl.length > 0 ? args.rpcUrl : "https://api.mainnet-beta.solana.com";
  const rpc = new SolanaRpc({
    endpoint: rpcUrl,
    maxRetries: 3,
    requestsPerSecond: 4,
  });

  try {
    if (args.command === "capture") {
      await runCapture(rpc, args.target, args.json);
      return;
    }
    if (args.command === "curve") {
      await runCurve(rpc, args.target, args.json);
      return;
    }
    fail("unknown command: " + args.command + String.fromCharCode(10) + USAGE, 2);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
}

void main();
