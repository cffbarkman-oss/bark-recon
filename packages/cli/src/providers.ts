import type { JupiterV2Order } from "@bark/venues";
import { formatPercent, formatSol, formatTokens } from "./format.js";
import type { SecurityFactor, TokenSecurity } from "@bark/venues";

/** Renders a Jupiter V2 order with the costs and expiry a trader needs. */
export function renderOrder(order: JupiterV2Order, currentBlockHeight: bigint | null): string {
  const lines: string[] = [];
  lines.push("route      " + order.router + " / " + order.mode + " (" + order.swapType + ")");
  lines.push("in         " + order.inAmount.toString() + " base units");
  lines.push("out        " + order.outAmount.toString() + " base units");
  lines.push("min out    " + order.otherAmountThreshold.toString() + " (slippage " + order.slippageBps + " bps)");
  lines.push("impact     " + formatPercent(order.priceImpact));
  lines.push("");
  lines.push("costs");
  lines.push("  network       " + formatSol(order.signatureFeeLamports) + " SOL");
  lines.push("  priority      " + formatSol(order.prioritizationFeeLamports) + " SOL");
  lines.push("  rent          " + formatSol(order.rentFeeLamports) + " SOL");
  lines.push("  total lamport " + formatSol(order.totalLamportCost) + " SOL");
  lines.push("  platform fee  " + order.feeBps + " bps" + (order.feeMint === null ? "" : " in " + order.feeMint.slice(0, 8) + "..."));
  lines.push("");
  lines.push("expiry     block " + order.lastValidBlockHeight.toString());
  if (currentBlockHeight !== null) {
    const remaining = order.lastValidBlockHeight - currentBlockHeight;
    lines.push("           " + (remaining > 0n ? remaining.toString() + " blocks left" : "EXPIRED"));
  }
  lines.push("");
  lines.push("hops");
  for (const step of order.routePlan) {
    lines.push(
      "  " + formatPercent(step.percent / 100) + "  " + step.label + "  " +
        formatTokens(step.inAmount, 6, 2) + " -> " + formatTokens(step.outAmount, 6, 2),
    );
  }
  return lines.join(String.fromCharCode(10));
}

/** Renders GoPlus security as named factors, worst first. */
export function renderRisk(security: TokenSecurity, factors: SecurityFactor[]): string {
  const lines: string[] = [];
  lines.push("mint       " + security.mint);
  lines.push("token      " + (security.symbol ?? "?") + " / " + (security.name ?? "?"));
  lines.push("holders    " + (security.holderCount === null ? "n/a" : security.holderCount.toLocaleString("en-US")));
  lines.push("trusted    " + (security.trusted ? "yes" : "no"));
  lines.push("");
  const sorted = [...factors].sort((a, b) => b.severity - a.severity);
  if (sorted.length === 0) {
    lines.push("no risk factors reported");
    return lines.join(String.fromCharCode(10));
  }
  lines.push("factors (worst first)");
  for (const factor of sorted) {
    const marker = factor.severity >= 0.8 ? "!!" : factor.severity > 0 ? " !" : "  ";
    lines.push("  " + marker + " " + formatPercent(factor.severity, 0).padStart(4) + "  " + factor.label);
    lines.push("        " + factor.detail);
  }
  return lines.join(String.fromCharCode(10));
}
