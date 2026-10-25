import { describe, it, expect, vi } from 'vitest';
import { fetchSignedUrl, fetchSignedBinary, fetchSignedProto, fetchSignedJson, uploadToSignedUrl, fetchSignedUrlData } from './signed_url.js';

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

  describe('uploadToSignedUrl', () => {
    it('uploads array buffer with content-type and returns response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const data = new Uint8Array([1, 2, 3, 4]);
      const resp = await uploadToSignedUrl('https://storage.cloud/upload', data, 'application/octet-stream', { fetchFn: mockFetch as any });
      expect(resp.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://storage.cloud/upload', expect.objectContaining({
        method: 'PUT',
      }));
    });

    it('throws error when upload fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const data = new Uint8Array([1, 2, 3]);
      await expect(uploadToSignedUrl('https://storage.cloud/upload', data, undefined, { fetchFn: mockFetch as any }))
        .rejects.toThrow('Direct upload to storage failed: Forbidden');
    });
  });

  describe('fetchSignedUrlData', () => {
    it('downloads binary data successfully via two-step fetch', async () => {
      const payload = new TextEncoder().encode('Sample file content');
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/get-file') {
          return new Response(JSON.stringify({ url: 'https://storage.cloud/file.bin' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://storage.cloud/file.bin') {
          return new Response(payload, { status: 200 });
        }
        return new Response(null, { status: 404 });
      });

      global.fetch = mockFetch;
      const buffer = await fetchSignedUrlData('/api/get-file');
      expect(Array.from(new Uint8Array(buffer))).toEqual(Array.from(payload));
    });

    it('validates SHA-256 checksum when x-amz-checksum-sha256 is present', async () => {
      const payload = new TextEncoder().encode('Checksum validated payload');
      const hashBuffer = await crypto.subtle.digest('SHA-256', payload);
      const hashBytes = new Uint8Array(hashBuffer);
      let binary = '';
      for (let i = 0; i < hashBytes.length; i++) {
        binary += String.fromCharCode(hashBytes[i]);
      }
      const validSha256 = btoa(binary);

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/get-file') {
          return new Response(JSON.stringify({ url: 'https://storage.cloud/file.bin' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://storage.cloud/file.bin') {
          return new Response(payload, {
            status: 200,
            headers: { 'x-amz-checksum-sha256': validSha256 },
          });
        }
        return new Response(null, { status: 404 });
      });

      const buffer = await fetchSignedUrlData('/api/get-file');
      expect(Array.from(new Uint8Array(buffer))).toEqual(Array.from(payload));
    });

    it('throws error when downloaded checksum mismatches', async () => {
      const payload = new TextEncoder().encode('Tampered content');

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/get-file') {
          return new Response(JSON.stringify({ url: 'https://storage.cloud/file.bin' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://storage.cloud/file.bin') {
          return new Response(payload, {
            status: 200,
            headers: { 'x-amz-checksum-sha256': 'wrong-checksum==' },
          });
        }
        return new Response(null, { status: 404 });
      });

      await expect(fetchSignedUrlData('/api/get-file')).rejects.toThrow(/checksum mismatch/);
    });
  });
});
