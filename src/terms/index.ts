export interface TermsContent {
  type: string;
  version: string;
  content: string;
}

export interface TermsClientOptions {
  termsUrl?: string; // Default: '/api/legal/terms'
  acceptUrl?: string; // Default: '/api/me/terms'
  fetchWithAuth?: (url: string, init?: RequestInit) => Promise<Response>;
}

function encodeVarint(val: number): number[] {
  const bytes: number[] = [];
  let remaining = val;
  while (remaining > 127) {
    bytes.push((remaining & 127) | 128);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return bytes;
}

function encodeStringField(fieldNum: number, str: string): Uint8Array {
  const encodedStr = new TextEncoder().encode(str);
  const tag = (fieldNum << 3) | 2;
  return new Uint8Array([tag, ...encodeVarint(encodedStr.length), ...encodedStr]);
}

/**
 * Encodes an AcceptTermsRequestProto into binary protobuf bytes.
 */
export function encodeAcceptTermsRequest(version: string): Uint8Array {
  return encodeStringField(1, version);
}

/**
 * Decodes binary protobuf bytes into TermsContent (TermsInfoProto).
 */
export function decodeTermsInfo(buf: Uint8Array): TermsContent {
  const result: TermsContent = { type: '', version: '', content: '' };
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset < buf.length) {
    let tag = 0;
    let shift = 0;
    while (offset < buf.length) {
      const b = buf[offset++];
      tag |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;
    if (wireType === 2) {
      let len = 0;
      let lenShift = 0;
      while (offset < buf.length) {
        const b = buf[offset++];
        len |= (b & 0x7f) << lenShift;
        if ((b & 0x80) === 0) break;
        lenShift += 7;
      }
      const bytes = buf.subarray(offset, offset + len);
      offset += len;
      const strVal = decoder.decode(bytes);
      if (fieldNum === 1) result.type = strVal;
      else if (fieldNum === 2) result.version = strVal;
      else if (fieldNum === 3) result.content = strVal;
    } else if (wireType === 0) {
      while (offset < buf.length && (buf[offset++] & 0x80) !== 0) {}
    } else {
      break;
    }
  }
  return result;
}

export class TermsManager {
  private termsUrl: string;
  private acceptUrl: string;
  private fetchFn: (url: string, init?: RequestInit) => Promise<Response>;

  constructor(options?: TermsClientOptions) {
    this.termsUrl = options?.termsUrl || '/api/legal/terms';
    this.acceptUrl = options?.acceptUrl || '/api/me/terms';
    this.fetchFn = options?.fetchWithAuth || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
  }

  public async fetchTerms(overrideUrl?: string): Promise<TermsContent | null> {
    try {
      const resp = await this.fetchFn(overrideUrl || this.termsUrl, {
        headers: { Accept: 'application/x-protobuf' },
      });
      if (resp.ok) {
        const contentType = resp.headers?.get?.('content-type') || '';
        if (contentType.includes('application/json')) {
          return (await resp.json()) as TermsContent;
        }
        const buf = await resp.arrayBuffer();
        return decodeTermsInfo(new Uint8Array(buf));
      }
    } catch (e) {
      console.warn('[tsutils/terms] Failed to load terms:', e);
    }
    return null;
  }

  public async acceptTerms<T = Uint8Array>(version: string, overrideUrl?: string): Promise<T | null> {
    try {
      const reqBytes = encodeAcceptTermsRequest(version);
      const resp = await this.fetchFn(overrideUrl || this.acceptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-protobuf' },
        body: reqBytes as unknown as BodyInit,
      });
      if (resp.ok) {
        const contentType = resp.headers?.get?.('content-type') || '';
        if (contentType.includes('application/json')) {
          return (await resp.json()) as T;
        }
        const buf = await resp.arrayBuffer();
        return new Uint8Array(buf) as unknown as T;
      }
    } catch (e) {
      console.error('[tsutils/terms] Failed to accept terms:', e);
    }
    return null;
  }

  public hasAcceptedTerms(userVersion?: string | null, requiredVersion?: string | null): boolean {
    if (!requiredVersion) return true;
    if (!userVersion) return false;
    return userVersion.trim() === requiredVersion.trim();
  }
}

export async function fetchTerms(
  url: string = '/api/legal/terms',
  fetchFn: (url: string, init?: RequestInit) => Promise<Response> = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch
): Promise<TermsContent | null> {
  const tm = new TermsManager({ termsUrl: url, fetchWithAuth: fetchFn });
  return tm.fetchTerms();
}

export async function acceptTerms<T = Uint8Array>(
  version: string,
  url: string = '/api/me/terms',
  fetchFn: (url: string, init?: RequestInit) => Promise<Response> = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch
): Promise<T | null> {
  const tm = new TermsManager({ acceptUrl: url, fetchWithAuth: fetchFn });
  return tm.acceptTerms<T>(version);
}

export function hasAcceptedTerms(userVersion?: string | null, requiredVersion?: string | null): boolean {
  if (!requiredVersion) return true;
  if (!userVersion) return false;
  return userVersion.trim() === requiredVersion.trim();
}
