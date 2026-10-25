import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProviderIconSVG,
  GOOGLE_SVG_ICON,
  MICROSOFT_SVG_ICON,
  APPLE_SVG_ICON,
  SSO_GENERIC_SVG_ICON,
  getAuthToken,
  setAuthToken,
  decodeJwtPayload,
  isTokenExpired,
  getOrCreateLoginNonce,
  buildLoginReturnTo,
  extractTokenFromUrl,
  AUTH_ERROR_LOGIN_NOT_REQUESTED,
  SESSION_STORAGE_LOGIN_NONCE,
  AuthManager,
  SignInPanelHandler,
  type AuthProviderPublic,
} from './index.js';

describe('getProviderIconSVG', () => {
  it('returns Google icon for google provider ID or iconName', () => {
    expect(getProviderIconSVG(undefined, 'google')).toBe(GOOGLE_SVG_ICON);
    expect(getProviderIconSVG('google-oauth', undefined)).toBe(GOOGLE_SVG_ICON);
  });

  it('returns Microsoft icon for microsoft, azure, or entra', () => {
    expect(getProviderIconSVG(undefined, 'microsoft')).toBe(MICROSOFT_SVG_ICON);
    expect(getProviderIconSVG(undefined, 'azure-ad')).toBe(MICROSOFT_SVG_ICON);
    expect(getProviderIconSVG('entra_id', undefined)).toBe(MICROSOFT_SVG_ICON);
  });

  it('returns Apple icon for apple', () => {
    expect(getProviderIconSVG(undefined, 'apple')).toBe(APPLE_SVG_ICON);
  });

  it('never injects configured SVG as markup; renders it as an <img> data URL', () => {
    const html = getProviderIconSVG('<svg><image href="x" onerror="alert(1)"/></svg>', 'custom');
    expect(html.startsWith('<img src="data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('onerror="');
  });

  it('escapes URL icons so they cannot break out of the src attribute', () => {
    const html = getProviderIconSVG('https://example.com/i.png" onerror="alert(1)', 'custom');
    expect(html).toContain('&quot; onerror=&quot;');
    expect(html).not.toContain('" onerror="');
  });

  it('rejects unsafe protocols and falls back to generic icon', () => {
    for (const icon of [
      'http://example.com/i.png',
      '//evil.com/i.png',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
    ]) {
      expect(getProviderIconSVG(icon, 'custom')).toBe(SSO_GENERIC_SVG_ICON);
    }
  });

  it('allows https, same-site paths and raster data URLs', () => {
    expect(getProviderIconSVG('https://cdn.example.com/i.png', 'custom')).toContain('src="https://cdn.example.com/i.png"');
    expect(getProviderIconSVG('/icons/sso.png', 'custom')).toContain('src="/icons/sso.png"');
    expect(getProviderIconSVG('data:image/png;base64,AAAA', 'custom')).toContain('src="data:image/png;base64,AAAA"');
  });
});

describe('Token helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores and retrieves auth token in localStorage', () => {
    expect(getAuthToken()).toBeNull();
    setAuthToken('test-token-123');
    expect(getAuthToken()).toBe('test-token-123');
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();
  });

  it('decodes JWT payload correctly', () => {
    const payload = { sub: 'usr-1', email: 'test@test.com', exp: 1999999999 };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `header.${b64}.signature`;

    const decoded = decodeJwtPayload<{ sub: string; email: string }>(token);
    expect(decoded?.sub).toBe('usr-1');
    expect(decoded?.email).toBe('test@test.com');
  });

  it('detects expired and non-expired JWT tokens', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const pastExp = Math.floor(Date.now() / 1000) - 60;

    const validToken = `h.${Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64url')}.s`;
    const expiredToken = `h.${Buffer.from(JSON.stringify({ exp: pastExp })).toString('base64url')}.s`;

    expect(isTokenExpired(validToken)).toBe(false);
    expect(isTokenExpired(expiredToken)).toBe(true);
    expect(isTokenExpired('not-a-token')).toBe(true);
  });
});

describe('Nonce & URL helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete (window as any).location;
    window.location = new URL('http://localhost/') as any;
  });

  it('creates and persists per-tab login nonce in sessionStorage', () => {
    const nonce1 = getOrCreateLoginNonce();
    expect(nonce1).toBeTruthy();
    expect(sessionStorage.getItem(SESSION_STORAGE_LOGIN_NONCE)).toBe(nonce1);

    const nonce2 = getOrCreateLoginNonce();
    expect(nonce2).toBe(nonce1);
  });

  it('buildLoginReturnTo embeds login nonce and strips sensitive params', () => {
    const returnTo = buildLoginReturnTo({
      baseUrl: 'http://localhost/app?token=secret&error=old#hash',
    });
    const url = new URL(returnTo);
    expect(url.hash).toBe('');
    expect(url.searchParams.has('token')).toBe(false);
    expect(url.searchParams.has('error')).toBe(false);
    expect(url.searchParams.get('login_nonce')).toBe(sessionStorage.getItem(SESSION_STORAGE_LOGIN_NONCE));
  });

  it('extractTokenFromUrl accepts matching nonce and cleans URL', () => {
    const nonce = 'tab-nonce-1234';
    sessionStorage.setItem(SESSION_STORAGE_LOGIN_NONCE, nonce);

    delete (window as any).location;
    window.location = new URL(`http://localhost/dashboard?login_nonce=${nonce}#token=jwt-secret-session`) as any;

    const result = extractTokenFromUrl();
    expect(result.token).toBe('jwt-secret-session');
    expect(result.authError).toBeNull();
    expect(getAuthToken()).toBe('jwt-secret-session');
    // Nonce was consumed
    expect(sessionStorage.getItem(SESSION_STORAGE_LOGIN_NONCE)).toBeNull();
  });

  it('extractTokenFromUrl rejects token if login nonce does not match', () => {
    sessionStorage.setItem(SESSION_STORAGE_LOGIN_NONCE, 'my-tab-nonce');

    delete (window as any).location;
    window.location = new URL(`http://localhost/dashboard?login_nonce=attacker-nonce#token=malicious-token`) as any;

    const result = extractTokenFromUrl();
    expect(result.token).toBeNull();
    expect(result.authError).toBe(AUTH_ERROR_LOGIN_NOT_REQUESTED);
    expect(getAuthToken()).toBeNull();
  });

  it('extractTokenFromUrl extracts error details from query and fragment', () => {
    delete (window as any).location;
    window.location = new URL(
      `http://localhost/app?error=access_denied#error_provider=microsoft&error_account_type=work&error_email=alice%40corp.com`
    ) as any;

    const result = extractTokenFromUrl();
    expect(result.token).toBeNull();
    expect(result.authError).toBe('access_denied');
    expect(result.errorDetails?.provider).toBe('microsoft');
    expect(result.errorDetails?.accountType).toBe('work');
    expect(result.errorDetails?.email).toBe('alice@corp.com');
  });
});

describe('AuthManager', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete (window as any).location;
    window.location = new URL('http://localhost/') as any;
  });

  it('initializes and manages user profile, tokens, and roles', async () => {
    const mockUser = {
      id: 'usr-100',
      email: 'user@example.com',
      companyRoles: { '10': 0, '20': 1 },
    };

    const fetchUser = vi.fn().mockResolvedValue(mockUser);
    const authChanged = vi.fn();

    const auth = new AuthManager({
      loginPathPrefix: '/api/v1/auth',
      providers: [{ id: 'google', name: 'Google', client_id: 'c1' }],
      fetchUser,
      onAuthChanged: authChanged,
    });

    // Mock valid token in storage
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = `h.${Buffer.from(JSON.stringify({ sub: 'usr-100', exp: futureExp })).toString('base64url')}.s`;
    auth.setAuthToken(token);

    const ok = await auth.establishSession();
    expect(ok).toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getUser()).toEqual(mockUser);
    expect(authChanged).toHaveBeenCalledWith(mockUser);

    // Test role lookup
    expect(auth.getRole(10)).toBe(0);
    expect(auth.getRole('20')).toBe(1);
    expect(auth.getRole(99)).toBeNull();

    // Test rolling renewal token
    const newExp = futureExp + 7200;
    const renewedToken = `h.${Buffer.from(JSON.stringify({ sub: 'usr-100', exp: newExp })).toString('base64url')}.s`;
    auth.handleRenewedToken(renewedToken);
    expect(auth.getAuthToken()).toBe(renewedToken);

    // Test signout
    auth.signout();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getUser()).toBeNull();
    expect(auth.getAuthToken()).toBeNull();
    expect(authChanged).toHaveBeenCalledWith(null);
  });

  it('buildLoginUrl creates correct route with provider and return_to', () => {
    const auth = new AuthManager({
      loginPathPrefix: '/api/v1/auth',
      providers: [{ id: 'microsoft', name: 'Microsoft' }],
    });

    const url = auth.buildLoginUrl('microsoft', 'http://localhost/return');
    expect(url).toBe('/api/v1/auth/microsoft/login?return_to=http%3A%2F%2Flocalhost%2Freturn');
  });
});

describe('SignInPanelHandler', () => {
  it('renders SSO buttons into container and wires clicks to authManager.signinRedirect', () => {
    document.body.innerHTML = `
      <div id="sign-in-panel">
        <div id="auth-error-banner"></div>
        <div id="sign-in-buttons-container"></div>
      </div>
    `;

    const providers: AuthProviderPublic[] = [
      { id: 'google', name: 'Google' },
      { id: 'microsoft', name: 'Microsoft' },
    ];
    const auth = new AuthManager({ providers });
    const signinSpy = vi.spyOn(auth, 'signinRedirect').mockImplementation(() => {});

    const handler = new SignInPanelHandler(auth);
    handler.renderButtons();

    const buttons = document.querySelectorAll('.sso-sign-in-btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Google');
    expect(buttons[1].textContent).toContain('Microsoft');

    (buttons[0] as HTMLButtonElement).click();
    expect(signinSpy).toHaveBeenCalledWith('google');
  });

  it('renders error message into error banner if lastAuthError is set', () => {
    document.body.innerHTML = `
      <div id="sign-in-panel">
        <div id="auth-error-banner" style="display: none;"></div>
        <div id="sign-in-buttons-container"></div>
      </div>
    `;

    const auth = new AuthManager();
    auth.setLastAuthError('Account linking failed');

    const handler = new SignInPanelHandler(auth);
    handler.render();

    const errorBanner = document.getElementById('auth-error-banner');
    expect(errorBanner?.style.display).not.toBe('none');
    expect(errorBanner?.innerHTML).toContain('Account linking failed');
  });
});
