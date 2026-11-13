/** Debounce changing intake without starving a continuously spoken conversation.
 * One worker runs at a time; input arriving during it is coalesced into one rerun. */
export type RecheckSchedulingState = {
  key: string;
  enabled: boolean;
  current: boolean;
  retryAt?: number;
};
export class ReconciliationScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;
  private observed = "";
  private pendingSince: number | null = null;
  private changedAt = 0;
  private disposed = false;
  constructor(
    private readonly state: () => RecheckSchedulingState,
    private readonly worker: () => Promise<boolean>,
    private readonly debounceMs = 1200,
    private readonly maximumWaitMs = 5000,
    private readonly now = () => Date.now(),
  ) {}
  refresh() {
    if (this.disposed) return;
    const input = this.state();
    if (!input.enabled || input.current || !input.key) {
      this.clearTimer();
      this.pendingSince = null;
      this.observed = input.key;
      return;
    }
    const now = this.now();
    if (input.key !== this.observed || this.pendingSince === null) {
      this.observed = input.key;
      this.changedAt = now;
      this.pendingSince ??= now;
    }
    if (this.running) return;
    const at = Math.max(
      Math.min(
        this.changedAt + this.debounceMs,
        this.pendingSince + this.maximumWaitMs,
      ),
      input.retryAt ?? 0,
    );
    this.clearTimer();
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.start();
      },
      Math.max(0, at - now),
    );
  }
  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private start(force = false): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.running) return this.running;
    const input = this.state();
    if (input.current) return Promise.resolve(true);
    if (!force && !input.enabled) return Promise.resolve(false);
    this.clearTimer();
    this.pendingSince = null;
    // Promise.resolve defers worker execution until running is published, even
    // when the worker completes synchronously or changes the observed input.
    const promise = Promise.resolve()
      .then(this.worker)
      .finally(() => {
        if (this.running !== promise) return;
        this.running = null;
        this.refresh();
      });
    this.running = promise;
    return promise;
  }
  async flush(): Promise<boolean> {
    if (this.running) await this.running;
    return this.start(true);
  }
  cancel() {
    this.clearTimer();
    this.pendingSince = null;
    this.observed = "";
  }
  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
