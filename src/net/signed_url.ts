export interface FetchSignedUrlOptions {
  fetchFn?: typeof fetch;
}

/**
 * Fetches a presigned URL from an API endpoint returning { url: string }.
 * Returns the URL string or null if the request failed or no URL was returned.
 */
export async function fetchSignedUrl(
  endpoint: string,
  options?: FetchSignedUrlOptions
): Promise<string | null> {
  try {
    const fetcher = options?.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    const resp = await fetcher(endpoint);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { url?: string };
    return data?.url || null;
  } catch {
    return null;
  }
}

/**
 * Fetches raw binary content from a signed URL endpoint.
 * First queries the endpoint for { url: string }, then fetches the binary payload from storage.
 */
export async function fetchSignedBinary(
  endpoint: string,
  options?: FetchSignedUrlOptions
): Promise<Uint8Array | null> {
  const url = await fetchSignedUrl(endpoint, options);
  if (!url) return null;
  try {
    const fetcher = options?.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    const resp = await fetcher(url);
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * Fetches and decodes a protobuf document from a signed URL endpoint.
 * Takes a protobuf decode function (e.g. MyProto.decode) and returns the typed message or null.
 */
export async function fetchSignedProto<T>(
  endpoint: string,
  decodeFn: (bytes: Uint8Array) => T,
  options?: FetchSignedUrlOptions
): Promise<T | null> {
  const bytes = await fetchSignedBinary(endpoint, options);
  if (!bytes) return null;
  try {
    return decodeFn(bytes);
  } catch (err) {
    console.warn(`[tsutils/net] Failed to decode protobuf from ${endpoint}:`, err);
    return null;
  }
}

/**
 * Fetches and parses a JSON document from a signed URL endpoint.
 */
export async function fetchSignedJson<T = any>(
  endpoint: string,
  options?: FetchSignedUrlOptions
): Promise<T | null> {
  const url = await fetchSignedUrl(endpoint, options);
  if (!url) return null;
  try {
    const fetcher = options?.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    const resp = await fetcher(url);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}
