export interface FetchSignedUrlOptions {
  fetchFn?: typeof fetch;
}

export interface UploadToSignedUrlOptions {
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
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
 * Transparently verifies SHA-256 checksum if x-amz-checksum-sha256 response header is present.
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

    // Verify SHA-256 checksum if exposed by storage response headers
    const expectedSha256 = resp.headers?.get('x-amz-checksum-sha256');
    if (expectedSha256 && typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashBytes = new Uint8Array(hashBuffer);
      let binary = '';
      for (let i = 0; i < hashBytes.length; i++) {
        binary += String.fromCharCode(hashBytes[i]);
      }
      const calculatedSha256 = btoa(binary);
      if (calculatedSha256 !== expectedSha256) {
        throw new Error('Downloaded file checksum mismatch: data corruption detected');
      }
    }

    return new Uint8Array(buffer);
  } catch (err) {
    if (err instanceof Error && err.message.includes('checksum mismatch')) {
      throw err;
    }
    return null;
  }
}

/**
 * Uploads data directly to a presigned S3/storage PUT URL, computing and attaching
 * an SHA-256 checksum header (x-amz-checksum-sha256) when Web Cryptography API is available.
 */
export async function uploadToSignedUrl(
  uploadUrl: string,
  data: Blob | ArrayBuffer | Uint8Array,
  contentType?: string,
  options?: UploadToSignedUrlOptions
): Promise<Response> {
  let arrayBuffer: ArrayBuffer;
  let bodyData: BodyInit;

  if (data instanceof ArrayBuffer) {
    arrayBuffer = data;
    bodyData = data;
  } else if (ArrayBuffer.isView(data)) {
    arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    bodyData = data as unknown as BodyInit;
  } else {
    arrayBuffer = await (data as Blob).arrayBuffer();
    bodyData = data;
  }

  const headers: Record<string, string> = { ...(options?.headers || {}) };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  // Transparently compute SHA-256 checksum if Web Cryptography API is available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashBytes = new Uint8Array(hashBuffer);
      let binary = '';
      for (let i = 0; i < hashBytes.length; i++) {
        binary += String.fromCharCode(hashBytes[i]);
      }
      headers['x-amz-checksum-sha256'] = btoa(binary);
    } catch (e) {
      console.warn('[tsutils/net] Could not compute upload checksum:', e);
    }
  }

  const fetcher = options?.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
  const response = await fetcher(uploadUrl, {
    method: 'PUT',
    headers,
    body: bodyData,
  });

  if (!response.ok) {
    const err: any = new Error(`Direct upload to storage failed: ${response.statusText}`);
    err.status = response.status;
    throw err;
  }

  return response;
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


/**
 * Helper function to perform a two-step fetch:
 * 1. Request a JSON payload from the API that contains a signed URL (`url` field).
 * 2. Fetch the actual file data from that signed URL (without forwarding headers like Authorization).
 * 3. Transparently validates response SHA-256 checksum if returned by storage (x-amz-checksum-sha256).
 * 
 * @param apiUrl The API endpoint that returns the signed URL JSON
 * @param init Optional RequestInit options (e.g. headers) for the first API call
 * @returns A promise that resolves to the downloaded file's ArrayBuffer
 */
export async function fetchSignedUrlData(apiUrl: string, init?: RequestInit): Promise<ArrayBuffer> {
  const response = await fetch(apiUrl, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch signed URL from API: ${response.statusText}`);
  }

  const { url } = await response.json();
  if (!url) {
    throw new Error("API response did not contain a valid signed URL");
  }

  const fileResponse = await fetch(url);
  if (!fileResponse.ok) {
    const err: any = new Error(`Failed to download file from signed URL: ${fileResponse.statusText}`);
    err.status = fileResponse.status;
    throw err;
  }

  const buffer = await fileResponse.arrayBuffer();

  // Verify SHA-256 checksum if exposed by storage response headers
  const expectedSha256 = fileResponse.headers.get('x-amz-checksum-sha256');
  if (expectedSha256 && typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashBytes = new Uint8Array(hashBuffer);
    let binary = '';
    for (let i = 0; i < hashBytes.length; i++) {
      binary += String.fromCharCode(hashBytes[i]);
    }
    const calculatedSha256 = btoa(binary);
    if (calculatedSha256 !== expectedSha256) {
      throw new Error('Downloaded file checksum mismatch: data corruption detected');
    }
  }

  return buffer;
}
