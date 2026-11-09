/**
 * Order lifecycle.
 *
 * A trading UI that shows one "failed" state is lying to the user. Four
 * different things can happen after a quote, and they need different actions:
 *
 *   expired  - the quote died before landing; nothing was attempted on chain
 *   rejected - the cluster refused it immediately; nothing is in flight
 *   failed   - it landed and reverted; funds moved, the trade did not happen
 *   landed   - it committed; settlement still has to be reconciled separately
 *
 * The distinguishing information is the block height. A quote is valid until
 * lastValidBlockHeight, so "not found on chain" means pending before that
 * height and expired after it - never both, and never failed.
 *
 * This module is deliberately network-free: it takes chain status as input, so
 * the same state machine runs in a browser, a server, or a test.
 */

export type OrderState =
  | "quoted"
  | "signed"
  | "submitted"
  | "pending"
  | "landed"
  | "failed"
  | "expired"
  | "rejected";

export interface StateTransition {
  state: OrderState;
  at: number;
  note?: string;
}

export interface OrderRecord {
  requestId: string;
  state: OrderState;
  signature: string | null;
  slot: number | null;
  error: unknown;
  lastValidBlockHeight: bigint;
  createdAt: number;
  updatedAt: number;
  history: StateTransition[];
}

export interface QuoteInput {
  requestId: string;
  lastValidBlockHeight: bigint;
  now?: number;
}

export interface ChainStatusInput {
  slot: number;
  err: unknown;
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  now?: number;
}

export class OrderStateError extends Error {
  public override readonly name = "OrderStateError";
}

const TERMINAL: ReadonlySet<OrderState> = new Set<OrderState>([
  "landed",
  "failed",
  "expired",
  "rejected",
]);

export function isTerminal(state: OrderState): boolean {
  return TERMINAL.has(state);
}

/**
 * Tracks orders from quote to a terminal state.
 *
 * Every transition is timestamped, because the interesting production question
 * is not "what state is it in" but "how long was it in the previous one".
 */
export class OrderReconciler {
  private readonly orders = new Map<string, OrderRecord>();

  /** Records a freshly quoted order. */
  register(input: QuoteInput): OrderRecord {
    if (this.orders.has(input.requestId)) {
      throw new OrderStateError("Order already registered: " + input.requestId);
    }
    const now = input.now ?? Date.now();
    const record: OrderRecord = {
      requestId: input.requestId,
      state: "quoted",
      signature: null,
      slot: null,
      error: null,
      lastValidBlockHeight: input.lastValidBlockHeight,
      createdAt: now,
      updatedAt: now,
      history: [{ state: "quoted", at: now }],
    };
    this.orders.set(input.requestId, record);
    return record;
  }

  get(requestId: string): OrderRecord | null {
    return this.orders.get(requestId) ?? null;
  }

  all(): OrderRecord[] {
    return [...this.orders.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  private transition(
    requestId: string,
    next: OrderState,
    at: number,
    note?: string,
    patch: Partial<Pick<OrderRecord, "signature" | "slot" | "error">> = {},
  ): OrderRecord {
    const record = this.orders.get(requestId);
    if (record === undefined) {
      throw new OrderStateError("Unknown order: " + requestId);
    }
    if (isTerminal(record.state)) {
      throw new OrderStateError(
        "Order " + requestId + " is already terminal (" + record.state + ")",
      );
    }
    const updated: OrderRecord = {
      ...record,
      ...patch,
      state: next,
      updatedAt: at,
      history: [...record.history, { state: next, at, ...(note === undefined ? {} : { note }) }],
    };
    this.orders.set(requestId, updated);
    return updated;
  }

  /** The taker signed; the transaction is ready to send. */
  markSigned(requestId: string, signature: string, now = Date.now()): OrderRecord {
    if (signature.length === 0) {
      throw new OrderStateError("A signed order needs a signature");
    }
    if (this.get(requestId)?.state !== "quoted") {
      throw new OrderStateError("Can only sign a quoted order: " + requestId);
    }
    return this.transition(requestId, "signed", now, undefined, { signature });
  }

  /** The signed transaction was handed to an RPC or a sender. */
  markSubmitted(requestId: string, now = Date.now()): OrderRecord {
    const record = this.get(requestId);
    if (record === null) {
      throw new OrderStateError("Unknown order: " + requestId);
    }
    if (record.state !== "signed") {
      throw new OrderStateError("Can only submit a signed order: " + requestId);
    }
    return this.transition(requestId, "submitted", now);
  }

  /** The sender refused it outright - nothing is in flight. */
  markRejected(requestId: string, reason: unknown, now = Date.now()): OrderRecord {
    return this.transition(requestId, "rejected", now, String(reason), { error: reason });
  }

  /**
   * Applies a chain status lookup.
   *
   * A null status means the cluster has not seen the transaction. That is
   * pending while the quote is still valid and expired after it, which is why
   * this method needs the current block height.
   */
  applyChainStatus(
    requestId: string,
    status: ChainStatusInput | null,
    currentBlockHeight: bigint,
    now = Date.now(),
  ): OrderRecord {
    const record = this.get(requestId);
    if (record === null) {
      throw new OrderStateError("Unknown order: " + requestId);
    }
    if (isTerminal(record.state)) {
      return record;
    }

    if (status === null) {
      if (currentBlockHeight > record.lastValidBlockHeight) {
        return this.transition(
          requestId,
          "expired",
          now,
          "not found by block " + currentBlockHeight.toString() +
            " (quote valid to " + record.lastValidBlockHeight.toString() + ")",
        );
      }
      return this.transition(
        requestId,
        "pending",
        now,
        "not yet visible on chain; quote still valid",
      );
    }

    if (status.err !== null && status.err !== undefined) {
      return this.transition(requestId, "failed", now, "landed and reverted", {
        slot: status.slot,
        error: status.err,
      });
    }

    const confirmed =
      status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized";
    if (confirmed) {
      return this.transition(requestId, "landed", now, "confirmed at slot " + status.slot, {
        slot: status.slot,
      });
    }
    return this.transition(requestId, "pending", now, "processed, awaiting confirmation", {
      slot: status.slot,
    });
  }

  /** Expires every order whose quote is no longer valid. */
  expireStale(currentBlockHeight: bigint, now = Date.now()): OrderRecord[] {
    const expired: OrderRecord[] = [];
    for (const record of this.orders.values()) {
      if (isTerminal(record.state)) {
        continue;
      }
      if (currentBlockHeight > record.lastValidBlockHeight) {
        expired.push(
          this.transition(
            record.requestId,
            "expired",
            now,
            "quote expired at block " + record.lastValidBlockHeight.toString(),
          ),
        );
      }
    }
    return expired;
  }

  /** Orders still waiting on chain, for a poller to re-check. */
  inFlight(): OrderRecord[] {
    return [...this.orders.values()].filter(
      (record) => record.state === "submitted" || record.state === "pending",
    );
  }
}
