import { describe, it, expect } from 'vitest';
import { escapeHtml } from './index.js';

describe('escapeHtml', () => {
    it('handles null, undefined, and empty string', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml('')).toBe('');
    });

    it('escapes dangerous HTML characters', () => {
        expect(escapeHtml("<script>alert('xss')</script>")).toBe(
            "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"
        );
        expect(escapeHtml('a & b "c" \'d\' <e>')).toBe(
            "a &amp; b &quot;c&quot; &#039;d&#039; &lt;e&gt;"
        );
    });

    it('preserves safe strings', () => {
        expect(escapeHtml('Hello World 123!')).toBe('Hello World 123!');
    });
});
