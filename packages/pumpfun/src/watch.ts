import { LogsSubscriber, type WebSocketLike } from "@bark/solana";
import { PUMP_PROGRAM_ID, PUMP_ROUTER_PROGRAM_ID } from "./programs.js";
import { decodePumpEvent } from "./events.js";
import { toCreate, type PumpCreate } from "./parse.js";

/**
 * Live launch watcher.
 *
 * Subscribes to pump program logs and yields a decoded create the moment one
 * lands. This is the cheapest credible discovery feed a terminal can run: no
 * indexer, no polling, no third-party API - one websocket and the decoders in
 * this package.
 *
 * Measured on mainnet: ~340 log notifications in 100 seconds produced a launch
 * in under a minute, which became the fixture this repo tests against.
 *
 * One subscription per program, deliberately. Public endpoints reject a
 * multi-address subscription outright ("Only 1 address supported"), and a
 * silently half-working feed is worse than two explicit ones.
 */

export interface LaunchWatcherOptions {
  url?: string;
  socketFactory?: (url: string) => WebSocketLike;
  onLaunch: (launch: PumpCreate) => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number) => void;
  /** Also watch the router program. Default false. */
  includeRouter?: boolean;
}

export class PumpLaunchWatcher {
  private readonly subscribers: LogsSubscriber[] = [];
  private readonly onLaunch: (launch: PumpCreate) => void;
  private readonly seen = new Set<string>();

  constructor(options: LaunchWatcherOptions) {
    this.onLaunch = options.onLaunch;

    const programs = [PUMP_PROGRAM_ID.toBase58()];
    if (options.includeRouter === true) {
      programs.push(PUMP_ROUTER_PROGRAM_ID.toBase58());
    }

    for (const program of programs) {
      this.subscribers.push(
        new LogsSubscriber([program], {
          url: options.url ?? "wss://api.mainnet-beta.solana.com",
          ...(options.socketFactory === undefined ? {} : { socketFactory: options.socketFactory }),
          ...(options.onError === undefined ? {} : { onError: options.onError }),
          ...(options.onReconnect === undefined ? {} : { onReconnect: options.onReconnect }),
          onLogs: (notification) =>
            this.handle(
              notification.signature,
              notification.logs,
              notification.err,
              notification.slot,
            ),
        }),
      );
    }
  }

  connect(): void {
    for (const subscriber of this.subscribers) {
      subscriber.connect();
    }
  }

  close(): void {
    for (const subscriber of this.subscribers) {
      subscriber.close();
    }
  }

  get isSubscribed(): boolean {
    return this.subscribers.some((subscriber) => subscriber.isSubscribed);
  }

  /** Exposed for tests: process a log batch directly. */
  handle(
    signature: string,
    logs: string[],
    err: unknown = null,
    slot: number | null = null,
  ): PumpCreate | null {
    if (err !== null) {
      return null;
    }
    for (const line of logs) {
      if (!line.startsWith("Program data: ")) {
        continue;
      }
      let payload: Uint8Array;
      try {
        payload = new Uint8Array(Buffer.from(line.slice(14), "base64"));
      } catch {
        continue;
      }
      const decoded = decodePumpEvent(payload);
      if (decoded.kind !== "create") {
        continue;
      }
      if (this.seen.has(signature)) {
        return null;
      }
      this.seen.add(signature);
      const launch = toCreate(decoded.event, {
        signature,
        slot: slot ?? 0,
        blockTime: null,
      });
      this.onLaunch(launch);
      return launch;
    }
    return null;
  }
}
