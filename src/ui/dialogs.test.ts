import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showConfirmationDialog, runWithBusy } from './dialogs.js';

describe('ui dialogs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('showConfirmationDialog', () => {
    it('resolves true when confirm button is clicked', async () => {
      const promise = showConfirmationDialog({
        title: 'Delete Item',
        message: 'Are you sure?',
        confirmText: 'Yes, Delete',
      });

      const overlay = document.querySelector('.confirm-modal-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay?.querySelector('h3')?.textContent).toBe('Delete Item');
      expect(overlay?.querySelector('p')?.textContent).toBe('Are you sure?');

      const confirmBtn = overlay?.querySelector('button.btn-danger') as HTMLButtonElement;
      expect(confirmBtn.textContent).toBe('Yes, Delete');
      confirmBtn.click();

      const result = await promise;
      expect(result).toBe(true);
    });

    it('resolves false when cancel button is clicked', async () => {
      const promise = showConfirmationDialog({
        title: 'Cancel Action',
        message: 'Will you cancel?',
        cancelText: 'No',
      });

      const cancelBtn = document.querySelector('button.btn-secondary') as HTMLButtonElement;
      expect(cancelBtn.textContent).toBe('No');
      cancelBtn.click();

      const result = await promise;
      expect(result).toBe(false);
    });

    it('handles required confirmation phrase', async () => {
      const promise = showConfirmationDialog({
        title: 'Danger Zone',
        message: 'Type DELETE',
        requiredPhrase: 'DELETE',
      });

      const confirmBtn = document.querySelector('button.btn-danger') as HTMLButtonElement;
      const input = document.querySelector('input') as HTMLInputElement;

      expect(confirmBtn.disabled).toBe(true);

      input.value = 'wrong';
      input.dispatchEvent(new Event('input'));
      expect(confirmBtn.disabled).toBe(true);

      input.value = 'DELETE';
      input.dispatchEvent(new Event('input'));
      expect(confirmBtn.disabled).toBe(false);

      confirmBtn.click();
      const result = await promise;
      expect(result).toBe(true);
    });

    it('resolves false on Escape key', async () => {
      const promise = showConfirmationDialog({
        title: 'Dismissable',
        message: 'Press esc to exit',
      });

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const result = await promise;
      expect(result).toBe(false);
    });
  });

  describe('runWithBusy', () => {
    it('executes action, sets button loading state, and restores it afterwards', async () => {
      const button = document.createElement('button');
      button.innerHTML = 'Save';
      document.body.appendChild(button);

      let actionCalled = false;
      const res = await runWithBusy(async (updateStatus) => {
        actionCalled = true;
        expect(button.disabled).toBe(true);
        expect(button.classList.contains('btn-loading')).toBe(true);
        expect(button.innerHTML).toContain('Saving...');
        updateStatus?.({ message: 'Still working...' });
        return 'success';
      }, {
        button,
        busyText: 'Saving...',
        message: 'Initial message',
      });

      expect(actionCalled).toBe(true);
      expect(res).toBe('success');
      expect(button.disabled).toBe(false);
      expect(button.classList.contains('btn-loading')).toBe(false);
      expect(button.innerHTML).toBe('Save');
    });

    it('cleans up loading overlay even if action throws', async () => {
      const button = document.createElement('button');
      button.textContent = 'Submit';
      document.body.appendChild(button);

      await expect(runWithBusy(async () => {
        throw new Error('Action failed');
      }, { button, busyText: 'Submitting...' })).rejects.toThrow('Action failed');

      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe('Submit');
    });
  });
});
