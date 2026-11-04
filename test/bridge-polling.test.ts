import assert from "node:assert/strict";
import test from "node:test";
import {
  BridgePolling,
  type BridgePollingResult,
  type BridgePollingTimers,
} from "../src/lifecycle/bridge-polling";

type ScheduledTimer = {
  callback: () => void;
  delay: number;
  cleared: boolean;
};

class FakeTimers {
  readonly scheduled: ScheduledTimer[] = [];

  readonly timers: BridgePollingTimers = {
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      this.scheduled.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => {
      (timer as unknown as ScheduledTimer).cleared = true;
    },
  };

  async runNext(): Promise<void> {
    const timer = this.scheduled.find((candidate) => !candidate.cleared);
    assert.ok(timer, "expected a scheduled timer");
    timer.cleared = true;
    timer.callback();
    await Promise.resolve();
    await Promise.resolve();
  }

  activeDelays(): number[] {
    return this.scheduled
      .filter((timer) => !timer.cleared)
      .map((timer) => timer.delay);
  }
}

test("polling retries with a capped exponential backoff", async () => {
  const timers = new FakeTimers();
  const results: BridgePollingResult[] = [
    "unavailable",
    "error",
    "disconnected",
    "incompatible",
    "unavailable",
    "unavailable",
  ];
  const polling = new BridgePolling(
    async () => results.shift() ?? "unavailable",
    timers.timers,
  );

  polling.start();
  const delays = [timers.activeDelays()[0]];
  for (let index = 0; index < 6; index += 1) {
    await timers.runNext();
    delays.push(timers.activeDelays()[0]);
  }

  assert.deepEqual(
    delays,
    [5_000, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000],
  );
});

test("polling resets after reconnect and stops for rejected pairing", async () => {
  const timers = new FakeTimers();
  const results: BridgePollingResult[] = ["connected", "unauthorized"];
  const polling = new BridgePolling(
    async () => results.shift() ?? "unavailable",
    timers.timers,
  );

  polling.start();
  await timers.runNext();
  assert.deepEqual(timers.activeDelays(), [5_000]);

  await timers.runNext();
  assert.deepEqual(timers.activeDelays(), []);
});

test("polling replaces and releases its timer", () => {
  const timers = new FakeTimers();
  const polling = new BridgePolling(async () => "connected", timers.timers);

  polling.start();
  const first = timers.scheduled[0];
  polling.start();
  polling.stop();

  assert.equal(first?.cleared, true);
  assert.deepEqual(timers.activeDelays(), []);
});
