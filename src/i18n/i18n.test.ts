import { describe, it, expect, beforeEach, vi } from 'vitest';
import { I18n } from './index.js';

describe('I18n', () => {
    beforeEach(() => {
        I18n.setTranslations({
            WELCOME: 'Välkommen',
            HELLO_NAME: 'Hej {name}, du har {count} meddelanden',
            PLACEHOLDER_EMAIL: 'Ange e-post',
        });
    });

    it('translates simple key', () => {
        expect(I18n.t('WELCOME')).toBe('Välkommen');
    });

    it('returns default value or key when missing', () => {
        expect(I18n.t('MISSING_KEY', undefined, 'Fallback')).toBe('Fallback');
        expect(I18n.t('MISSING_KEY')).toBe('MISSING_KEY');
    });

    it('interpolates placeholder replacements', () => {
        expect(I18n.t('HELLO_NAME', { name: 'Anna', count: 3 })).toBe(
            'Hej Anna, du har 3 meddelanden'
        );
    });

    it('translates DOM elements with [data-i18n]', () => {
        document.body.innerHTML = `
            <h1 data-i18n="WELCOME">Old Header</h1>
            <input data-i18n="PLACEHOLDER_EMAIL" placeholder="Old Placeholder" />
        `;

        I18n.translatePage();

        expect(document.querySelector('h1')?.textContent).toBe('Välkommen');
        expect((document.querySelector('input') as HTMLInputElement)?.placeholder).toBe('Ange e-post');
    });

    it('loads translations via fetch function', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ GREETING: 'Hello world' }),
        } as any);

        await I18n.load('/locales/en.json', mockFetch);
        expect(mockFetch).toHaveBeenCalledWith('/locales/en.json');
        expect(I18n.t('GREETING')).toBe('Hello world');
    });
});
