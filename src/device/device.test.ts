import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard, copyWithFeedback } from './clipboard.js';
import { ScreenWakeLock } from './screen_wake_lock.js';

describe('device utilities', () => {
  describe('clipboard', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      vi.useRealTimers();
    });

    it('copies text to clipboard', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const res = await copyToClipboard('Hello World');
      expect(res).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith('Hello World');
    });

    it('copies with UI button feedback and reverts after duration', async () => {
      vi.useFakeTimers();
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const btn = document.createElement('button');
      btn.textContent = 'Copy Link';
      document.body.appendChild(btn);

      const promise = copyWithFeedback(btn, 'https://example.com', 'Copied!', 1000);
      const res = await promise;
      expect(res).toBe(true);
      expect(btn.textContent).toBe('Copied!');

      vi.advanceTimersByTime(1000);
      expect(btn.textContent).toBe('Copy Link');
    });
  });

  describe('ScreenWakeLock', () => {
    it('initializes and cleans up event listeners on destroy', () => {
      const lock = new ScreenWakeLock({ inactivityTimeoutMs: 5000 });
      expect(lock).toBeDefined();
      lock.destroy();
    });

    it('requests wake lock when API is supported', async () => {
      const releaseMock = vi.fn().mockResolvedValue(undefined);
      const sentinelMock = {
        release: releaseMock,
        addEventListener: vi.fn(),
      };
      const requestMock = vi.fn().mockResolvedValue(sentinelMock);

      Object.assign(navigator, {
        wakeLock: {
          request: requestMock,
        },
      });

      const lock = new ScreenWakeLock();
      lock.requestLock();
      await Promise.resolve();

      expect(requestMock).toHaveBeenCalledWith('screen');

      lock.releaseLock();
      expect(releaseMock).toHaveBeenCalled();
      lock.destroy();
    });
  });
});
