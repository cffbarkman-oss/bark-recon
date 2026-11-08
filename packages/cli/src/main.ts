#!/usr/bin/env node
import { SolanaRpc, decodeAccountData, decodeTokenAccount } from "@bark/solana";
import { decodePool } from "@bark/pumpswap";
import { GoPlusVenue, JupiterSwapV2Venue, securityFactors } from "@bark/venues";
import { renderPool } from "./pool.js";
import { renderOrder, renderRisk } from "./providers.js";
import {
  decodeBondingCurve,
  deriveBondingCurveAddress,
  matchesDiscriminator,
  DISCRIMINATORS,
  parsePumpTransaction,
  reconcileTrade,
  PumpLaunchWatcher,
  type BondingCurveAccount,
} from "@bark/pumpfun";
import { analyseConcentration, buildHolderSnapshot } from "@bark/market-intel";
import { renderCurve, renderTransaction } from "./render.js";
import { renderHolders } from "./holders.js";

const USAGE = [
  "bark-recon - inspect pump.fun activity on Solana",
  "",
  "Usage:",
  "  bark-recon capture <signature> [--rpc <url>] [--json]",
  "  bark-recon curve <mint-or-curve-address> [--rpc <url>] [--json]",
  "  bark-recon holders <mint> [--rpc <url>] [--json]",
  "  bark-recon pool <pool-address> [--rpc <url>] [--json]",
  "  bark-recon quote <inputMint> <outputMint> <amount> [--taker <pubkey>] [--json]",
  "  bark-recon risk <mint> [--json]",
  "  bark-recon watch [--seconds 30] [--json]",
  "",
  "Environment:",
  "  SOLANA_RPC_URL   endpoint to use when --rpc is omitted",
  "",
  "Exit codes: 0 ok, 1 request failed, 2 usage error",
].join(String.fromCharCode(10));

interface Args {
  command: string;
  target: string;
  extra: string[];
  rpcUrl: string;
  json: boolean;
  seconds: number;
  taker: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let rpcUrl = process.env.SOLANA_RPC_URL ?? "";
  let json = false;
  let seconds = 30;
  let taker = "11111111111111111111111111111111";

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
    if (arg === "--seconds") {
      seconds = Number(argv[i + 1] ?? "30");
      i += 1;
      continue;
    }
    if (arg === "--taker") {
      taker = argv[i + 1] ?? taker;
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
    extra: positional.slice(2),
    rpcUrl,
    json,
    seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 30,
    taker,
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

async function runHolders(rpc: SolanaRpc, mint: string, json: boolean): Promise<void> {
  const supply = await rpc.getTokenSupply(mint);
  if (supply === null) {
    fail("no token supply for " + mint, 1);
  }
  const largest = await rpc.getTokenLargestAccounts(mint);
  const snapshot = buildHolderSnapshot(
    largest.map((account) => ({ address: account.address, amount: BigInt(account.amount) })),
  );
  const report = analyseConcentration(snapshot.balances, BigInt(supply.amount));

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          mint,
          decimals: supply.decimals,
          covered: snapshot.coveredAccounts,
          truncated: snapshot.truncated,
          topShares: report.topShares,
          hhi: report.hhi,
          gini: report.gini,
          effectiveHolders: report.effectiveHolders,
        },
        null,
        2,
      ) + String.fromCharCode(10),
    );
    return;
  }
  process.stdout.write(renderHolders(mint, snapshot, report, supply.decimals) + String.fromCharCode(10));
}

async function runPool(rpc: SolanaRpc, target: string, json: boolean): Promise<void> {
  const poolAccount = await rpc.getAccountInfo(target);
  if (poolAccount === null) {
    fail("no account at " + target, 1);
  }
  const pool = decodePool(target, decodeAccountData(poolAccount));

  const [baseAccount, quoteAccount] = await Promise.all([
    rpc.getAccountInfo(pool.poolBaseTokenAccount.toBase58()),
    rpc.getAccountInfo(pool.poolQuoteTokenAccount.toBase58()),
  ]);
  if (baseAccount === null || quoteAccount === null) {
    fail("pool token accounts are missing", 1);
  }
  const base = decodeTokenAccount(pool.poolBaseTokenAccount.toBase58(), decodeAccountData(baseAccount));
  const quote = decodeTokenAccount(pool.poolQuoteTokenAccount.toBase58(), decodeAccountData(quoteAccount));

  const reserves = {
    base: base.amount,
    quote: quote.amount,
    virtualQuote: pool.virtualQuoteReserves,
  };

  if (json) {
    process.stdout.write(JSON.stringify({
      pool: pool.address.toBase58(),
      baseMint: pool.baseMint.toBase58(),
      quoteMint: pool.quoteMint.toBase58(),
      baseReserves: reserves.base.toString(),
      quoteReserves: reserves.quote.toString(),
      virtualQuoteReserves: reserves.virtualQuote.toString(),
      lpSupply: pool.lpSupply.toString(),
    }, null, 2) + String.fromCharCode(10));
    return;
  }
  process.stdout.write(renderPool(pool, reserves, { baseDecimals: 6, quoteDecimals: 9 }) + String.fromCharCode(10));
}

async function runQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  taker: string,
  json: boolean,
): Promise<void> {
  const venue = new JupiterSwapV2Venue();
  const order = await venue.order({
    inputMint,
    outputMint,
    amount: BigInt(amount),
    taker,
    slippageBps: 50,
  });
  if (json) {
    process.stdout.write(JSON.stringify({
      inAmount: order.inAmount.toString(),
      outAmount: order.outAmount.toString(),
      otherAmountThreshold: order.otherAmountThreshold.toString(),
      priceImpact: order.priceImpact,
      totalLamportCost: order.totalLamportCost.toString(),
      lastValidBlockHeight: order.lastValidBlockHeight.toString(),
      route: order.routePlan.map((step) => step.label),
    }, null, 2) + String.fromCharCode(10));
    return;
  }
  process.stdout.write(renderOrder(order, null) + String.fromCharCode(10));
}

async function runRisk(mint: string, json: boolean): Promise<void> {
  const venue = new GoPlusVenue();
  const security = await venue.tokenSecurity(mint);
  if (security === null) {
    fail("no security record for " + mint, 1);
  }
  const factors = securityFactors(security);
  if (json) {
    process.stdout.write(JSON.stringify({ security, factors }, null, 2) + String.fromCharCode(10));
    return;
  }
  process.stdout.write(renderRisk(security, factors) + String.fromCharCode(10));
}

async function runWatch(seconds: number, json: boolean): Promise<void> {
  const launches: string[] = [];
  const watcher = new PumpLaunchWatcher({
    onLaunch: (launch) => {
      launches.push(launch.mint.toBase58());
      if (json) {
        process.stdout.write(JSON.stringify({
          signature: launch.signature,
          mint: launch.mint.toBase58(),
          symbol: launch.symbol,
          name: launch.name,
          curve: launch.bondingCurve.toBase58(),
          creator: launch.creator.toBase58(),
        }) + String.fromCharCode(10));
        return;
      }
      process.stdout.write(
        [
          "LAUNCH  " + launch.symbol + "  " + launch.name,
          "  mint      " + launch.mint.toBase58(),
          "  curve     " + launch.bondingCurve.toBase58(),
          "  creator   " + launch.creator.toBase58(),
          "  mayhem    " + (launch.isMayhemMode ? "yes" : "no"),
        ].join(String.fromCharCode(10)) + String.fromCharCode(10),
      );
    },
    onError: (error) => process.stderr.write("stream: " + error.message + String.fromCharCode(10)),
    onReconnect: (attempt) => process.stderr.write("reconnecting (attempt " + attempt + ")" + String.fromCharCode(10)),
  });

  process.stderr.write("watching pump.fun launches for " + seconds + "s..." + String.fromCharCode(10));
  watcher.connect();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  watcher.close();
  process.stderr.write("saw " + launches.length + " launch(es)" + String.fromCharCode(10));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const needsTarget = args.command !== "watch" && args.command !== "help";
  if (args.command === "help" || (needsTarget && args.target.length === 0)) {
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
    if (args.command === "holders") {
      await runHolders(rpc, args.target, args.json);
      return;
    }
    if (args.command === "quote") {
      const inputMint = args.target;
      const outputMint = args.extra[0] ?? "";
      const amount = args.extra[1] ?? "";
      if (outputMint === "" || amount === "") {
        fail("usage: bark-recon quote <inputMint> <outputMint> <amount> [--taker <pubkey>]", 2);
      }
      await runQuote(inputMint, outputMint, amount, args.taker, args.json);
      return;
    }
    if (args.command === "risk") {
      await runRisk(args.target, args.json);
      return;
    }
    if (args.command === "pool") {
      await runPool(rpc, args.target, args.json);
      return;
    }
    if (args.command === "watch") {
      await runWatch(args.seconds, args.json);
      return;
    }
    fail("unknown command: " + args.command + String.fromCharCode(10) + USAGE, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = message.includes("429")
      ? String.fromCharCode(10) +
        "hint: the public RPC throttles holder and account queries. Point SOLANA_RPC_URL or --rpc at your own endpoint."
      : "";
    fail(message + hint, 1);
  }
}

void main();
