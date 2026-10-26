/** Parameter and storage keys for session authentication. */
export const PARAM_TOKEN = 'token';
export const PARAM_AUTH_ERROR = 'auth_error';
export const PARAM_LOGIN_NONCE = 'login_nonce';
export const SESSION_STORAGE_LOGIN_NONCE = 'login_nonce';
export const DEFAULT_AUTH_STORAGE_KEY = 'auth_token';

/** URL query parameter names for organization / tenant invitations. */
export const PARAM_INVITE = "invite";
export const PARAM_INVITE_RESULT = "invite_result";
export const PARAM_INVITE_TARGET = "invite_target";
export const PARAM_INVITE_TENANT = "invite_tenant";
export const PARAM_INVITE_COMPANY = "invite_company";

/** Standard invitation outcome result codes. */
export const INVITE_RESULT_ACCEPTED = "accepted";
export const INVITE_RESULT_USED = "used";
export const INVITE_RESULT_INVALID = "invalid";
export const INVITE_RESULT_EXPIRED = "expired";

/** Outcome of an invitation link carried through a successful sign-in. */
export interface InviteResult {
  result: string;
  targetId: string | null;
  tenantId: string | null;
}


/** Auth error code shown when a sign-in token arrives that this tab did not request. */
export const AUTH_ERROR_LOGIN_NOT_REQUESTED = 'login_not_requested';

export const MICROSOFT_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

export function isPersonalMicrosoftAccount(tenantId?: string): boolean {
  return tenantId?.toLowerCase() === MICROSOFT_CONSUMER_TENANT_ID;
}

export interface AuthErrorDetails {
  provider?: string;
  tenantId?: string;
  accountType?: string;
  email?: string;
  code?: string;
}

/** Returns the stored authentication token, or null if unauthenticated. */
export function getAuthToken(storageKey: string = DEFAULT_AUTH_STORAGE_KEY): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage.getItem(storageKey);
}

/** Updates or removes the stored authentication token. */
export function setAuthToken(token: string | null, storageKey: string = DEFAULT_AUTH_STORAGE_KEY): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (token) {
    window.localStorage.setItem(storageKey, token);
  } else {
    window.localStorage.removeItem(storageKey);
  }
}

/** Decodes a JWT payload without verifying its cryptographic signature. */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    let jsonStr: string;
    if (typeof atob !== 'undefined') {
      jsonStr = atob(base64);
    } else {
      const g = globalThis as unknown as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
      jsonStr = g.Buffer ? g.Buffer.from(base64, 'base64').toString('utf-8') : '';
    }
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

/** Checks whether a JWT is expired past its exp claim. */
export function isTokenExpired(token: string, skewSeconds: number = 0): boolean {
  const claims = decodeJwtPayload<{ exp?: number }>(token);
  if (!claims || typeof claims.exp !== 'number') return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds + skewSeconds >= claims.exp;
}

/**
 * Returns this tab's login nonce, creating one if needed.
 * The nonce is stored in sessionStorage (per tab) and passed through return_to.
 * A token returning is only accepted if it matches this nonce, preventing login CSRF.
 */
export function getOrCreateLoginNonce(): string {
  if (typeof window === 'undefined' || !window.sessionStorage) return '';
  let nonce = window.sessionStorage.getItem(SESSION_STORAGE_LOGIN_NONCE);
  if (!nonce) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      nonce = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }
    window.sessionStorage.setItem(SESSION_STORAGE_LOGIN_NONCE, nonce);
  }
  return nonce;
}

export interface BuildLoginReturnToOptions {
  baseUrl?: string;
  mode?: string;
  preserveQueryParams?: string[];
}

/**
 * Builds the sanitized return_to URL carrying this tab's login nonce.
 */
export function buildLoginReturnTo(options?: BuildLoginReturnToOptions): string {
  if (typeof window === 'undefined') return '';
  const currentUrl = options?.baseUrl || window.location.href;
  const url = new URL(currentUrl);

  // Clean sensitive parameters and fragment
  url.hash = '';
  url.searchParams.delete(PARAM_TOKEN);
  url.searchParams.delete(PARAM_AUTH_ERROR);
  url.searchParams.delete('error');
  url.searchParams.delete('signed_in_email');

  if (options?.mode !== undefined) {
    if (options.mode) {
      url.searchParams.set('mode', options.mode);
    } else {
      url.searchParams.delete('mode');
      url.searchParams.delete(PARAM_INVITE);
      url.searchParams.delete('email');
      url.searchParams.delete('tenant');
      url.searchParams.delete('church');
      url.searchParams.delete('company');
    }
  }

  url.searchParams.set(PARAM_LOGIN_NONCE, getOrCreateLoginNonce());
  return url.toString();
}

export interface ExtractTokenResult {
  token: string | null;
  authError: string | null;
  errorDetails: AuthErrorDetails | null;
  inviteResult: InviteResult | null;
}

/**
 * Extracts and consumes session tokens (#token=...) or error details from the URL.
 * Cleans the URL via history.replaceState to prevent token leakage into browser history.
 */
export function extractTokenFromUrl(options?: { storageKey?: string }): ExtractTokenResult {
  if (typeof window === 'undefined') {
    return { token: null, authError: null, errorDetails: null, inviteResult: null };
  }

  const url = new URL(window.location.href);
  const authError = url.searchParams.get(PARAM_AUTH_ERROR) || url.searchParams.get('error');
  const returnedNonce = url.searchParams.get(PARAM_LOGIN_NONCE);
  const signedInEmail = url.searchParams.get('signed_in_email');
  const hadQueryToken = url.searchParams.has(PARAM_TOKEN);

  const rawInviteResult = url.searchParams.get(PARAM_INVITE_RESULT);
  const rawInviteTarget = url.searchParams.get(PARAM_INVITE_TARGET)
    || url.searchParams.get(PARAM_INVITE_TENANT)
    || url.searchParams.get(PARAM_INVITE_COMPANY);

  url.searchParams.delete(PARAM_AUTH_ERROR);
  url.searchParams.delete('error');
  url.searchParams.delete(PARAM_LOGIN_NONCE);
  url.searchParams.delete(PARAM_TOKEN);
  url.searchParams.delete('signed_in_email');
  url.searchParams.delete(PARAM_INVITE_RESULT);
  url.searchParams.delete(PARAM_INVITE_TARGET);
  url.searchParams.delete(PARAM_INVITE_TENANT);
  url.searchParams.delete(PARAM_INVITE_COMPANY);

  let hashToken: string | null = null;
  let errProvider: string | null = null;
  let errTenantId: string | null = null;
  let errAccountType: string | null = null;
  let errEmail: string | null = null;

  let effectiveAuthError = authError;
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.substring(1));
    hashToken = hashParams.get(PARAM_TOKEN);
    errProvider = hashParams.get('error_provider');
    errTenantId = hashParams.get('error_tenant_id');
    errAccountType = hashParams.get('error_account_type');
    errEmail = hashParams.get('error_email');
    const hashError = hashParams.get('error') || hashParams.get(PARAM_AUTH_ERROR);
    if (!effectiveAuthError && hashError) {
      effectiveAuthError = hashError;
    }

    if (hashToken !== null) hashParams.delete(PARAM_TOKEN);
    if (hashError !== null) {
      hashParams.delete('error');
      hashParams.delete(PARAM_AUTH_ERROR);
    }
    if (errProvider !== null) hashParams.delete('error_provider');
    if (errTenantId !== null) hashParams.delete('error_tenant_id');
    if (errAccountType !== null) hashParams.delete('error_account_type');
    if (errEmail !== null) hashParams.delete('error_email');

    const remaining = hashParams.toString();
    url.hash = remaining ? '#' + remaining : '';
  }

  const hadInviteParams = rawInviteResult !== null || rawInviteTarget !== null;
  const hadFragErrorParams = errProvider !== null || errTenantId !== null || errAccountType !== null || errEmail !== null;
  const hadAuthParams = effectiveAuthError !== null || returnedNonce !== null || hashToken !== null || hadQueryToken || signedInEmail !== null || hadFragErrorParams || hadInviteParams;

  if (hadAuthParams && window.history && window.history.replaceState) {
    try {
      window.history.replaceState({}, document.title, url.toString());
    } catch {
      // In restricted test environments or sandbox frames, ignore SecurityError
    }
  }

  if (effectiveAuthError) {
    if (window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_STORAGE_LOGIN_NONCE);
    }
    const effectiveEmail = errEmail || signedInEmail || undefined;
    const effectiveTenantId = errTenantId || undefined;
    let computedAccountType = errAccountType || undefined;
    if (!computedAccountType && effectiveTenantId) {
      computedAccountType = isPersonalMicrosoftAccount(effectiveTenantId) ? 'personal' : 'work';
    }
    const hasDetails = !!(errProvider || effectiveTenantId || computedAccountType || effectiveEmail);
    const errorDetails: AuthErrorDetails | null = hasDetails ? {
      provider: errProvider || undefined,
      tenantId: effectiveTenantId || undefined,
      accountType: computedAccountType || undefined,
      email: effectiveEmail || undefined,
    } : null;
    setAuthToken(null, options?.storageKey);
    return { token: null, authError: effectiveAuthError, errorDetails, inviteResult: null };
  }

  if (hashToken) {
    const expectedNonce = window.sessionStorage ? window.sessionStorage.getItem(SESSION_STORAGE_LOGIN_NONCE) : null;
    if (window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_STORAGE_LOGIN_NONCE);
    }

    if (!expectedNonce || !returnedNonce || returnedNonce !== expectedNonce) {
      console.warn('[tsutils/auth] Ignoring sign-in token that was not requested from this tab (nonce mismatch)');
      setAuthToken(null, options?.storageKey);
      return {
        token: null,
        authError: AUTH_ERROR_LOGIN_NOT_REQUESTED,
        errorDetails: { code: AUTH_ERROR_LOGIN_NOT_REQUESTED },
        inviteResult: null,
      };
    }

    setAuthToken(hashToken, options?.storageKey);
    const parsedInviteResult: InviteResult | null = hadInviteParams ? {
      result: rawInviteResult || '',
      targetId: rawInviteTarget || null,
      tenantId: rawInviteTarget || null,
    } : null;
    return { token: hashToken, authError: null, errorDetails: null, inviteResult: parsedInviteResult };
  }

  return { token: null, authError: null, errorDetails: null, inviteResult: null };
}
