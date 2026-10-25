const activeTimeouts = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Copies text to the system clipboard using the Clipboard API.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('[tsutils/device] Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Copies text to the system clipboard and temporarily updates the button's textContent
 * to a feedback label (defaulting to 'Copied!'), reverting after durationMs.
 */
export async function copyWithFeedback(
  button: HTMLElement,
  text: string,
  feedbackText: string = 'Copied!',
  durationMs: number = 2000
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    const existingTimer = activeTimeouts.get(button);
    if (existingTimer) {
      clearTimeout(existingTimer);
    } else {
      button.dataset.originalText = button.textContent || '';
    }

    button.textContent = feedbackText;

    const timer = setTimeout(() => {
      const orig = button.dataset.originalText;
      if (orig !== undefined) {
        button.textContent = orig;
        delete button.dataset.originalText;
      }
      activeTimeouts.delete(button);
    }, durationMs);

    activeTimeouts.set(button, timer);
    return true;
  } catch (err) {
    console.error('[tsutils/device] Failed to copy to clipboard:', err);
    return false;
  }
}
