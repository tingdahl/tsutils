import { describe, it, expect, vi } from 'vitest';
import {
  TermsManager,
  fetchTerms,
  acceptTerms,
  hasAcceptedTerms,
  encodeAcceptTermsRequest,
  decodeTermsInfo,
} from './index.js';

describe('Terms Protobuf Helpers', () => {
  it('encodes and decodes protobuf messages cleanly', () => {
    const encodedReq = encodeAcceptTermsRequest('2026-09-21');
    expect(encodedReq).toBeInstanceOf(Uint8Array);
    expect(encodedReq[0]).toBe(0x0a); // field 1 length delimited

    // Mock terms info buffer
    const type = 'broadcaster';
    const version = '2026-09-21';
    const content = '# Terms';
    const te = new TextEncoder();
    const typeBytes = te.encode(type);
    const verBytes = te.encode(version);
    const contBytes = te.encode(content);

    const buf = new Uint8Array([
      0x0a, typeBytes.length, ...typeBytes,
      0x12, verBytes.length, ...verBytes,
      0x1a, contBytes.length, ...contBytes,
    ]);

    const decoded = decodeTermsInfo(buf);
    expect(decoded.type).toBe('broadcaster');
    expect(decoded.version).toBe('2026-09-21');
    expect(decoded.content).toBe('# Terms');
  });
});

describe('TermsManager', () => {
  it('fetches terms successfully using protobuf', async () => {
    const te = new TextEncoder();
    const typeBytes = te.encode('broadcaster');
    const verBytes = te.encode('2026-09-21');
    const contBytes = te.encode('# Terms and Conditions');

    const buf = new Uint8Array([
      0x0a, typeBytes.length, ...typeBytes,
      0x12, verBytes.length, ...verBytes,
      0x1a, contBytes.length, ...contBytes,
    ]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/x-protobuf' }),
      arrayBuffer: async () => buf.buffer,
    });

    const tm = new TermsManager({ fetchWithAuth: mockFetch as any });
    const terms = await tm.fetchTerms();

    expect(mockFetch).toHaveBeenCalledWith('/api/legal/terms', {
      headers: { Accept: 'application/x-protobuf' },
    });
    expect(terms).toEqual({
      type: 'broadcaster',
      version: '2026-09-21',
      content: '# Terms and Conditions',
    });
  });

  it('accepts terms and returns response using protobuf', async () => {
    const respBytes = new Uint8Array([0x08, 0x01]); // dummy proto bytes
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/x-protobuf' }),
      arrayBuffer: async () => respBytes.buffer,
    });

    const tm = new TermsManager({ fetchWithAuth: mockFetch as any });
    const res = await tm.acceptTerms('2026-09-21');

    expect(mockFetch).toHaveBeenCalledWith('/api/me/terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-protobuf' },
      body: encodeAcceptTermsRequest('2026-09-21'),
    });
    expect(res).toEqual(respBytes);
  });

  it('checks version acceptance correctly', () => {
    expect(hasAcceptedTerms('2026-09-21', '2026-09-21')).toBe(true);
    expect(hasAcceptedTerms(' 2026-09-21 ', '2026-09-21')).toBe(true);
    expect(hasAcceptedTerms('2026-01-01', '2026-09-21')).toBe(false);
    expect(hasAcceptedTerms(null, '2026-09-21')).toBe(false);
    expect(hasAcceptedTerms('anything', null)).toBe(true);
  });
});
