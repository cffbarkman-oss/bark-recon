/**
 * Wallet clustering.
 *
 * Wallets are linked when one funded the other (first funding event) or when
 * they co-signed a transaction. Linked wallets are merged transitively into a
 * cluster using a union-find with path compression, so a funding tree of any
 * depth collapses into a single identity.
 *
 * This is evidence, not proof: shared funding happens between friends too.
 * Callers should surface cluster size alongside the evidence that formed it.
 */

export interface FundingEdge {
  wallet: string;
  funder: string;
  lamports?: bigint;
  slot?: number;
}

export interface WalletCluster {
  id: string;
  wallets: string[];
  /** Wallets in this cluster that funded at least one member. */
  funders: string[];
  totalLamports: bigint;
  /** Number of distinct funding sources - a fan-in of many is suspicious. */
  fundingSourceCount: number;
}

interface Node {
  parent: string;
  size: number;
}

export class WalletClusterer {
  private readonly nodes = new Map<string, Node>();
  private readonly fundedBy = new Map<string, Set<string>>();
  private readonly lamports = new Map<string, bigint>();

  private ensure(wallet: string): Node {
    const existing = this.nodes.get(wallet);
    if (existing !== undefined) {
      return existing;
    }
    const node: Node = { parent: wallet, size: 1 };
    this.nodes.set(wallet, node);
    return node;
  }

  find(wallet: string): string {
    const node = this.ensure(wallet);
    if (node.parent === wallet) {
      return wallet;
    }
    const root = this.find(node.parent);
    node.parent = root;
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) {
      return;
    }
    const nodeA = this.nodes.get(rootA) as Node;
    const nodeB = this.nodes.get(rootB) as Node;
    if (nodeA.size < nodeB.size) {
      nodeA.parent = rootB;
      nodeB.size += nodeA.size;
    } else {
      nodeB.parent = rootA;
      nodeA.size += nodeB.size;
    }
  }

  addFunding(edge: FundingEdge): void {
    this.union(edge.wallet, edge.funder);
    const existing = this.fundedBy.get(edge.wallet) ?? new Set<string>();
    existing.add(edge.funder);
    this.fundedBy.set(edge.wallet, existing);
    if (edge.lamports !== undefined) {
      this.lamports.set(edge.wallet, (this.lamports.get(edge.wallet) ?? 0n) + edge.lamports);
    }
  }

  addCoSigners(wallets: string[]): void {
    if (wallets.length < 2) {
      return;
    }
    const first = wallets[0] as string;
    for (let i = 1; i < wallets.length; i += 1) {
      this.union(first, wallets[i] as string);
    }
  }

  get size(): number {
    return this.nodes.size;
  }

  clusters(): WalletCluster[] {
    const grouped = new Map<string, string[]>();
    for (const wallet of this.nodes.keys()) {
      const root = this.find(wallet);
      const members = grouped.get(root) ?? [];
      members.push(wallet);
      grouped.set(root, members);
    }

    const out: WalletCluster[] = [];
    for (const [root, wallets] of grouped) {
      const funders = new Set<string>();
      let total = 0n;
      for (const wallet of wallets) {
        for (const funder of this.fundedBy.get(wallet) ?? []) {
          if (funder !== wallet) {
            funders.add(funder);
          }
        }
        total += this.lamports.get(wallet) ?? 0n;
      }
      out.push({
        id: root,
        wallets: wallets.sort(),
        funders: [...funders].sort(),
        totalLamports: total,
        fundingSourceCount: funders.size,
      });
    }

    out.sort((a, b) => b.wallets.length - a.wallets.length);
    return out;
  }

  clusterOf(wallet: string): WalletCluster | null {
    const root = this.find(wallet);
    for (const cluster of this.clusters()) {
      if (cluster.id === root) {
        return cluster;
      }
    }
    return null;
  }
}
