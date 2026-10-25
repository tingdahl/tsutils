/**
 * Minimalist, dependency-free internationalization (i18n) engine for SPAs.
 */

export class I18n {
    private static translations: Record<string, string> = {};

    static setTranslations(dict: Record<string, string>): void {
        this.translations = { ...dict };
    }

    static getTranslations(): Record<string, string> {
        return { ...this.translations };
    }

    static async load(url: string, fetchFn?: typeof fetch): Promise<void> {
        const fetcher = fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
        const response = await fetcher(url);
        if (!response.ok) {
            throw new Error(`Failed to load translations from ${url}: ${response.statusText}`);
        }
        this.translations = await response.json();
        this.translatePage();
    }

    static t(key: string, replacements?: Record<string, string | number>, defaultValue?: string): string {
        let text = this.translations[key] ?? defaultValue ?? key;
        if (replacements) {
            for (const [k, v] of Object.entries(replacements)) {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
            }
        }
        return text;
    }

    static translatePage(root?: ParentNode): void {
        if (typeof document === 'undefined') return;
        const container = root || document;
        container.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                    el.placeholder = this.t(key);
                } else {
                    el.textContent = this.t(key);
                }
            }
        });
    }
}
