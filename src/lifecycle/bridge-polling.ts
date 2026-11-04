export type BridgePollingResult =
  | "connected"
  | "unauthorized"
  | "disconnected"
  | "connecting"
  | "incompatible"
  | "unavailable"
  | "error";

export type BridgePollingTimers = {
  setTimeout(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
};

const retryDelayMinMs = 5_000;
const retryDelayMaxMs = 60_000;

export class BridgePolling {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private retryDelayMs = retryDelayMinMs;

  constructor(
    private readonly poll: () => Promise<BridgePollingResult>,
    private readonly timers: BridgePollingTimers = globalThis,
  ) {}

  start(): void {
    this.stop();
    this.schedule(retryDelayMinMs);
  }

  stop(): void {
    this.generation += 1;
    if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
    this.timer = undefined;
    this.retryDelayMs = retryDelayMinMs;
  }

  private schedule(delay: number): void {
    const generation = this.generation;
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      void this.run(generation);
    }, delay);
  }

  private async run(generation: number): Promise<void> {
    const result = await this.poll();
    if (generation !== this.generation) return;
    if (result === "unauthorized") return;
    if (result === "connected") {
      this.retryDelayMs = retryDelayMinMs;
      this.schedule(retryDelayMinMs);
      return;
    }
    this.schedule(this.retryDelayMs);
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, retryDelayMaxMs);
  }
}
