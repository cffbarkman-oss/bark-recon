/**
 * @bark/execution - the boundary between a quote and a settled trade.
 *
 * Kept separate from the provider adapters on purpose: providers change, the
 * lifecycle does not. Everything here is deterministic and testable without a
 * network, so the state machine can be reasoned about before it is trusted with
 * real money.
 */

export * from "./order-state.js";
export * from "./settlement.js";
