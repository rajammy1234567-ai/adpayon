import { performance } from 'node:perf_hooks';

export class QueueOverloadError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code = 'TASK_QUEUE_OVERLOADED', message = 'Task verification queue depth limit exceeded') {
    super(message);
    this.name = 'QueueOverloadError';
    this.code = code;
    this.statusCode = 429;
  }
}

export interface QueueJobMetrics {
  queueWaitMs: number;
  queueDepth: number;
}

interface PendingJob<T> {
  fn: (metrics: QueueJobMetrics) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  enqueueTime: number;
}

interface TaskQueueState {
  running: boolean;
  pending: PendingJob<any>[];
}

/**
 * KeyedMutex / KeyedTaskQueue
 * 
 * DESIGN PRINCIPLES:
 * 1. Serializes execution of verification transactions belonging to the SAME task ID.
 * 2. Allows independent tasks to execute concurrently in full parallelism.
 * 3. Never holds a MongoDB session or connection while waiting in the queue.
 * 4. Automatic memory reclamation: idle task entries are deleted immediately upon drain.
 * 5. Bounded queue depth per task: rejects excess requests with QueueOverloadError (HTTP 429).
 * 6. Supports graceful drain during shutdown.
 * 7. Multi-instance boundary: This is an in-process optimization. In multi-instance clusters,
 *    MongoDB's atomic transaction checks remain the final authoritative source of truth.
 */
export class KeyedMutex {
  private readonly queues = new Map<string, TaskQueueState>();
  private readonly maxQueueDepth: number;
  private isDraining = false;
  private totalRejectionsCount = 0;

  constructor(optionsOrMaxDepth: number | { maxQueueDepth?: number } = 100) {
    if (typeof optionsOrMaxDepth === 'number') {
      this.maxQueueDepth = optionsOrMaxDepth;
    } else {
      this.maxQueueDepth = optionsOrMaxDepth?.maxQueueDepth ?? 100;
    }
  }

  /**
   * Enqueues an operation for the specified key.
   * Resolves when the operation completes; guarantees queue advancement even on error.
   */
  async run<T>(
    key: string,
    fn: (metrics: QueueJobMetrics) => Promise<T>
  ): Promise<T> {
    if (this.isDraining) {
      this.totalRejectionsCount++;
      throw new QueueOverloadError('SERVER_DRAINING', 'Task verification queue is draining during server shutdown');
    }

    let state = this.queues.get(key);
    if (!state) {
      state = { running: false, pending: [] };
      this.queues.set(key, state);
    }

    // Check bounded queue depth
    if (state.pending.length >= this.maxQueueDepth) {
      this.totalRejectionsCount++;
      throw new QueueOverloadError(
        'TASK_QUEUE_OVERLOADED',
        `Verification queue depth for task '${key}' exceeded limit of ${this.maxQueueDepth}`
      );
    }

    const enqueueTime = performance.now();

    return new Promise<T>((resolve, reject) => {
      state!.pending.push({
        fn,
        resolve,
        reject,
        enqueueTime,
      });

      if (!state!.running) {
        this.processQueue(key);
      }
    });
  }

  /**
   * Processes the next item for a specific task queue.
   */
  private async processQueue(key: string): Promise<void> {
    const state = this.queues.get(key);
    if (!state) return;

    if (state.pending.length === 0) {
      state.running = false;
      this.queues.delete(key); // Reclaim memory when idle
      return;
    }

    state.running = true;
    const nextJob = state.pending.shift()!;
    const queueWaitMs = Math.max(0, Number((performance.now() - nextJob.enqueueTime).toFixed(2)));
    const queueDepth = state.pending.length;

    try {
      const result = await nextJob.fn({ queueWaitMs, queueDepth });
      nextJob.resolve(result);
    } catch (err) {
      nextJob.reject(err);
    } finally {
      // Advance to next job in microtask to avoid stack overflow
      queueMicrotask(() => this.processQueue(key));
    }
  }

  /**
   * Returns current pending queue depth for a given task ID.
   */
  getQueueDepth(key: string): number {
    const state = this.queues.get(key);
    return state ? state.pending.length + (state.running ? 1 : 0) : 0;
  }

  /**
   * Returns total queue rejections due to overflow or shutdown.
   */
  getRejectionCount(): number {
    return this.totalRejectionsCount;
  }

  /**
   * Returns number of active task keys currently tracked in memory.
   */
  getActiveKeysCount(): number {
    return this.queues.size;
  }

  /**
   * Returns internal Map size (number of keys tracked).
   */
  getQueueSize(): number {
    return this.queues.size;
  }

  /**
   * Returns count of currently executing tasks.
   */
  getActiveCount(): number {
    let count = 0;
    for (const state of this.queues.values()) {
      if (state.running) count++;
    }
    return count;
  }

  /**
   * Sets draining state and awaits all in-flight and pending jobs to complete.
   */
  async drainAll(timeoutMs = 10000): Promise<boolean> {
    this.isDraining = true;
    const start = performance.now();

    while (this.queues.size > 0) {
      if (performance.now() - start > timeoutMs) {
        return false;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    return true;
  }

  /**
   * Resets draining state and clears queues (used for testing).
   */
  reset(): void {
    this.queues.clear();
    this.isDraining = false;
    this.totalRejectionsCount = 0;
  }
}

// Global singleton instance for verification transactions
export const taskVerificationMutex = new KeyedMutex(100);
