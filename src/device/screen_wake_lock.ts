export interface ScreenWakeLockOptions {
  /**
   * Inactivity timeout in ms after which the wake lock will be released if pokeActivity() is not called.
   * If undefined or <= 0, the lock remains held until explicitly released or destroyed.
   */
  inactivityTimeoutMs?: number;
}

/**
 * ScreenWakeLock manages the W3C Screen Wake Lock API.
 * Keeps the screen awake during live presentations, video playback, and active views.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private inactivityTimeoutMs: number;
  private timeoutId: number | null = null;
  private isRequested = false;
  private isAcquiring = false;
  private isDestroyed = false;

  constructor(options?: number | ScreenWakeLockOptions) {
    if (typeof options === 'number') {
      this.inactivityTimeoutMs = options;
    } else {
      this.inactivityTimeoutMs = options?.inactivityTimeoutMs ?? 0;
    }

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleUserInteraction = this.handleUserInteraction.bind(this);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('click', this.handleUserInteraction, { passive: true });
      window.addEventListener('touchstart', this.handleUserInteraction, { passive: true });
      window.addEventListener('keydown', this.handleUserInteraction, { passive: true });
    }
  }

  /**
   * Request that the screen be kept awake.
   */
  requestLock(): void {
    if (this.isDestroyed) return;
    this.isRequested = true;
    this.resetTimer();
    this.acquire();
  }

  /**
   * Called when active content or user interaction occurs.
   * Ensures the lock is acquired if desired and resets the inactivity timer.
   */
  pokeActivity(): void {
    if (this.isDestroyed) return;
    this.isRequested = true;
    this.resetTimer();
    if (!this.sentinel && !this.isAcquiring) {
      this.acquire();
    }
  }

  private resetTimer(): void {
    if (this.timeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.inactivityTimeoutMs > 0 && typeof window !== 'undefined') {
      this.timeoutId = window.setTimeout(() => {
        this.releaseLock();
      }, this.inactivityTimeoutMs);
    }
  }

  private async acquire(): Promise<void> {
    if (this.isDestroyed || !this.isRequested) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (this.sentinel || this.isAcquiring) return;

    try {
      this.isAcquiring = true;
      const sentinel = await navigator.wakeLock.request('screen');
      if (!this.isRequested || this.isDestroyed) {
        await sentinel.release().catch(() => {});
        return;
      }
      this.sentinel = sentinel;
      this.sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) {
          this.sentinel = null;
        }
      });
    } catch {
      // Browser may reject if window is not active or due to power-saving settings.
    } finally {
      this.isAcquiring = false;
    }
  }

  /**
   * Releases any currently held wake lock.
   */
  releaseLock(): void {
    this.isRequested = false;
    if (this.timeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.sentinel) {
      this.sentinel.release().catch(() => {});
      this.sentinel = null;
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && this.isRequested) {
      this.acquire();
    }
  }

  private handleUserInteraction(): void {
    if (this.isRequested && !this.sentinel) {
      this.acquire();
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.releaseLock();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', this.handleUserInteraction);
      window.removeEventListener('touchstart', this.handleUserInteraction);
      window.removeEventListener('keydown', this.handleUserInteraction);
    }
  }
}
