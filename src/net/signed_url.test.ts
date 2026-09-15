import { describe, it, expect, vi } from 'vitest';
import { fetchSignedUrl, fetchSignedBinary, fetchSignedProto, fetchSignedJson } from './signed_url.js';

describe('signed_url generic helpers', () => {
  describe('fetchSignedUrl', () => {
    it('returns URL when endpoint succeeds', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://storage.cloud/files/1?token=xyz' }),
      });

      const result = await fetchSignedUrl('/api/files/1', { fetchFn: mockFetch as any });
      expect(result).toBe('https://storage.cloud/files/1?token=xyz');
      expect(mockFetch).toHaveBeenCalledWith('/api/files/1');
    });

    it('returns null when endpoint returns 404', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetchSignedUrl('/api/files/99', { fetchFn: mockFetch as any });
      expect(result).toBeNull();
    });

    it('returns null when endpoint returns non-URL payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'none' }),
      });

      const result = await fetchSignedUrl('/api/files/1', { fetchFn: mockFetch as any });
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchSignedUrl('/api/files/1', { fetchFn: mockFetch as any });
      expect(result).toBeNull();
    });
  });

  describe('fetchSignedBinary', () => {
    it('fetches binary payload from resolved signed URL', async () => {
      const dummyData = new Uint8Array([1, 2, 3, 4]);
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/doc') {
          return {
            ok: true,
            json: async () => ({ url: 'https://storage.cloud/doc.bin' }),
          };
        }
        if (url === 'https://storage.cloud/doc.bin') {
          return {
            ok: true,
            arrayBuffer: async () => dummyData.buffer,
          };
        }
        return { ok: false };
      });

      const bytes = await fetchSignedBinary('/api/doc', { fetchFn: mockFetch as any });
      expect(bytes).toEqual(dummyData);
    });

    it('returns null if storage fetch fails', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/doc') {
          return {
            ok: true,
            json: async () => ({ url: 'https://storage.cloud/doc.bin' }),
          };
        }
        return { ok: false, status: 404 };
      });

      const bytes = await fetchSignedBinary('/api/doc', { fetchFn: mockFetch as any });
      expect(bytes).toBeNull();
    });
  });

  describe('fetchSignedProto', () => {
    it('decodes binary using provided decode function', async () => {
      const dummyData = new Uint8Array([10, 5, 104, 101, 108, 108, 111]);
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/proto-url') {
          return {
            ok: true,
            json: async () => ({ url: 'https://storage.cloud/entitlement.pb.br' }),
          };
        }
        return {
          ok: true,
          arrayBuffer: async () => dummyData.buffer,
        };
      });

      const mockDecoder = vi.fn().mockImplementation((bytes: Uint8Array) => ({
        greeting: 'hello',
        len: bytes.length,
      }));

      const result = await fetchSignedProto('/api/proto-url', mockDecoder, { fetchFn: mockFetch as any });
      expect(result).toEqual({ greeting: 'hello', len: dummyData.length });
      expect(mockDecoder).toHaveBeenCalledWith(dummyData);
    });

    it('returns null when decoder throws', async () => {
      const dummyData = new Uint8Array([1, 2]);
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/proto-url') {
          return {
            ok: true,
            json: async () => ({ url: 'https://storage.cloud/bad.pb' }),
          };
        }
        return {
          ok: true,
          arrayBuffer: async () => dummyData.buffer,
        };
      });

      const faultyDecoder = vi.fn().mockImplementation(() => {
        throw new Error('Invalid wire format');
      });

      const result = await fetchSignedProto('/api/proto-url', faultyDecoder, { fetchFn: mockFetch as any });
      expect(result).toBeNull();
    });
  });

  describe('fetchSignedJson', () => {
    it('fetches and parses JSON from storage signed URL', async () => {
      const mockData = { items: [1, 2, 3] };
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/json-url') {
          return {
            ok: true,
            json: async () => ({ url: 'https://storage.cloud/data.json' }),
          };
        }
        return {
          ok: true,
          json: async () => mockData,
        };
      });

      const result = await fetchSignedJson('/api/json-url', { fetchFn: mockFetch as any });
      expect(result).toEqual(mockData);
    });
  });
});
