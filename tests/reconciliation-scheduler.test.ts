import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReconciliationScheduler,
  type RecheckSchedulingState,
} from "../src/lib/reconciliation-scheduler";
const deferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
describe("realtime full-conversation scheduling", () => {
  it("checks continuously arriving intake within the maximum wait instead of starving on every new sentence", async () => {
    vi.useFakeTimers();
    const state: RecheckSchedulingState = {
      key: "first",
      enabled: true,
      current: false,
    };
    const run = vi.fn(async () => {
      state.current = true;
      return true;
    });
    const scheduler = new ReconciliationScheduler(() => state, run);
    scheduler.refresh();
    for (let n = 1; n <= 6; n++) {
      await vi.advanceTimersByTimeAsync(800);
      state.key = `sentence-${n}`;
      scheduler.refresh();
    }
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
  it("serializes an in-flight check and coalesces all newer inputs into one latest follow-up", async () => {
    vi.useFakeTimers();
    let checked = "";
    const state = { key: "one", enabled: true };
    const first = deferred();
    const seen: string[] = [];
    const run = vi.fn(async () => {
      const key = state.key;
      seen.push(key);
      if (seen.length === 1) await first.promise;
      checked = key;
      return true;
    });
    const scheduler = new ReconciliationScheduler(
      () => ({ ...state, current: checked === state.key }),
      run,
    );
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(1200);
    state.key = "two";
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(500);
    state.key = "three";
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(5000);
    expect(seen).toEqual(["one"]);
    first.resolve(true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(seen).toEqual(["one", "three"]);
    await vi.advanceTimersByTimeAsync(30000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });
  it("treats its own repaired output as the completed checkpoint without a paid request loop", async () => {
    vi.useFakeTimers();
    const state = { key: "wrong-answer", enabled: true, current: false };
    const gate = deferred();
    const run = vi.fn(async () => {
      await gate.promise;
      state.key = "repaired-answer";
      state.current = true;
      scheduler.refresh();
      return true;
    });
    const scheduler = new ReconciliationScheduler(() => state, run);
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(1200);
    gate.resolve(true);
    await vi.advanceTimersByTimeAsync(120000);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
  it("cancels an offline/disabled timer and resumes after connectivity returns", async () => {
    vi.useFakeTimers();
    const state = { key: "draft", enabled: true, current: false };
    const run = vi.fn(async () => {
      state.current = true;
      return true;
    });
    const scheduler = new ReconciliationScheduler(() => state, run);
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(800);
    state.enabled = false;
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).not.toHaveBeenCalled();
    state.enabled = true;
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(1200);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
  it("honors bounded retry policy while a new input can become eligible again", async () => {
    vi.useFakeTimers();
    let failures = 0,
      key = "first",
      retryAt = 0;
    const run = vi.fn(async () => {
      failures++;
      retryAt = Date.now() + 3000;
      return false;
    });
    const scheduler = new ReconciliationScheduler(
      () => ({ key, current: false, enabled: failures < 3, retryAt }),
      run,
    );
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(20000);
    expect(run).toHaveBeenCalledTimes(3);
    key = "new-input";
    failures = 0;
    retryAt = 0;
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(1200);
    expect(run).toHaveBeenCalledTimes(4);
    scheduler.dispose();
  });
  it("flushes the latest change after a current job without running jobs concurrently", async () => {
    vi.useFakeTimers();
    let checked = "",
      key = "first";
    const gate = deferred();
    let running = 0,
      maximum = 0;
    const run = vi.fn(async () => {
      const captured = key;
      running++;
      maximum = Math.max(maximum, running);
      if (captured === "first") await gate.promise;
      checked = captured;
      running--;
      return true;
    });
    const scheduler = new ReconciliationScheduler(
      () => ({ key, current: checked === key, enabled: true }),
      run,
    );
    scheduler.refresh();
    await vi.advanceTimersByTimeAsync(1200);
    key = "latest";
    scheduler.refresh();
    const finishing = scheduler.flush();
    gate.resolve(true);
    await expect(finishing).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
    scheduler.dispose();
  });
});
