export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  requiredPhrase?: string;
  requiredPhraseLabel?: string;
}

/**
 * Displays an accessible, promise-based confirmation dialog.
 * Supports optional required phrase matching (e.g. for destructive actions).
 * Returns true if confirmed, false if cancelled or dismissed.
 */
export function showConfirmationDialog(options: ConfirmationOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';

    const card = document.createElement('div');
    card.className = 'confirm-modal-card';

    const title = document.createElement('h3');
    title.textContent = options.title;
    card.appendChild(title);

    const msg = document.createElement('p');
    msg.textContent = options.message;
    card.appendChild(msg);

    let inputField: HTMLInputElement | null = null;
    if (options.requiredPhrase) {
      const label = document.createElement('label');
      label.textContent = options.requiredPhraseLabel || `Type "${options.requiredPhrase}" to confirm:`;
      card.appendChild(label);

      inputField = document.createElement('input');
      inputField.type = 'text';
      inputField.placeholder = options.requiredPhrase;
      card.appendChild(inputField);
    }

    const actions = document.createElement('div');
    actions.className = 'confirm-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = options.cancelText || 'Cancel';
    actions.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn-danger';
    confirmBtn.textContent = options.confirmText || 'OK';

    if (options.requiredPhrase) {
      confirmBtn.disabled = true;
      inputField?.addEventListener('input', () => {
        confirmBtn.disabled = inputField.value !== options.requiredPhrase;
      });
    }

    actions.appendChild(confirmBtn);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (inputField) {
      inputField.focus();
    } else {
      confirmBtn.focus();
    }

    const cleanup = () => {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
      }, 200);
    };

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    confirmBtn.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    const escListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escListener);
        cleanup();
        resolve(false);
      }
    };
    document.addEventListener('keydown', escListener);
  });
}

export interface BusyOptions {
  button?: HTMLButtonElement | HTMLElement | null;
  busyText?: string;
  blockUI?: boolean;
  message?: string;
}

/**
 * Executes an async action while disabling initiating buttons, displaying a spinner,
 * and optionally blocking UI interactions across the page until the action completes.
 */
export async function runWithBusy<T>(
  action: (updateStatus?: (opts: { message?: string; busyText?: string }) => void) => Promise<T>,
  options?: BusyOptions
): Promise<T> {
  const blockUI = options?.blockUI !== false;
  const button = options?.button;
  let originalButtonHtml: string | null = null;
  let originalButtonDisabled = false;
  let overlay: HTMLElement | null = null;

  if (button) {
    originalButtonDisabled = (button as HTMLButtonElement).disabled || false;
    (button as HTMLButtonElement).disabled = true;
    button.classList.add('btn-loading');
    if (options?.busyText) {
      originalButtonHtml = button.innerHTML;
      button.innerHTML = `<span class="btn-spinner"></span> ${options.busyText}`;
    }
  }

  if (blockUI) {
    overlay = document.createElement('div');
    overlay.className = 'busy-modal-overlay';
    const card = document.createElement('div');
    card.className = 'busy-modal-card';

    const spinner = document.createElement('div');
    spinner.className = 'spinner busy-spinner';
    card.appendChild(spinner);

    const msgEl = document.createElement('p');
    msgEl.className = 'busy-modal-message';
    msgEl.textContent = options?.message || '';
    card.appendChild(msgEl);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  const updateStatus = (opts: { message?: string; busyText?: string }) => {
    if (opts.message && overlay) {
      const msgEl = overlay.querySelector('.busy-modal-message');
      if (msgEl) {
        msgEl.textContent = opts.message;
      }
    }
    if (opts.busyText && button) {
      button.innerHTML = `<span class="btn-spinner"></span> ${opts.busyText}`;
    }
  };

  try {
    return await action(updateStatus);
  } finally {
    if (button) {
      button.classList.remove('btn-loading');
      (button as HTMLButtonElement).disabled = originalButtonDisabled;
      if (originalButtonHtml !== null) {
        button.innerHTML = originalButtonHtml;
      }
    }
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay?.remove();
      }, 150);
    }
  }
}
