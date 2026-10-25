import {
  DEFAULT_AUTH_STORAGE_KEY,
  getAuthToken,
  setAuthToken,
  isTokenExpired,
  extractTokenFromUrl,
  buildLoginReturnTo,
  type AuthErrorDetails,
} from './token.js';
import type { AuthProviderPublic, OIDCConfig } from './icons.js';

export interface AuthManagerOptions<TUser = unknown> {
  storageKey?: string;
  loginPathPrefix?: string;
  authConfigUrl?: string;
  providers?: AuthProviderPublic[];
  fetchUser?: (token: string) => Promise<TUser | null>;
  onAuthChanged?: (user: TUser | null) => void;
  onError?: (error: string, details?: AuthErrorDetails | null) => void;
}

/**
 * Manages user authentication, session tokens, login URLs, and user profiles.
 */
export class AuthManager<TUser = unknown> {
  private storageKey: string;
  private loginPathPrefix: string;
  private authConfigUrl?: string;
  private providers: AuthProviderPublic[] = [];
  private fetchUserFn?: (token: string) => Promise<TUser | null>;
  private onAuthChangedCallback?: (user: TUser | null) => void;
  private onErrorCallback?: (error: string, details?: AuthErrorDetails | null) => void;

  private user: TUser | null = null;
  private sessionExpired: boolean = false;
  private lastAuthError: string | null = null;
  private lastAuthErrorDetails: AuthErrorDetails | null = null;

  constructor(options?: AuthManagerOptions<TUser>) {
    this.storageKey = options?.storageKey || DEFAULT_AUTH_STORAGE_KEY;
    this.loginPathPrefix = (options?.loginPathPrefix || '/api/auth').replace(/\/+$/, '');
    this.authConfigUrl = options?.authConfigUrl;
    if (options?.providers) {
      this.providers = [...options.providers];
    }
    this.fetchUserFn = options?.fetchUser;
    this.onAuthChangedCallback = options?.onAuthChanged;
    this.onErrorCallback = options?.onError;
  }

  /** Initializes provider configuration if an authConfigUrl was specified. */
  public async init(): Promise<void> {
    if (!this.authConfigUrl) return;

    try {
      const resp = await fetch(this.authConfigUrl);
      if (resp.ok) {
        const config: OIDCConfig = await resp.json();
        this.providers = config.auth_providers || [];
      } else {
        console.warn(`[tsutils/auth] Failed to load auth config from ${this.authConfigUrl}: ${resp.statusText}`);
      }
    } catch (e) {
      console.warn(`[tsutils/auth] Error fetching auth config from ${this.authConfigUrl}:`, e);
    }
  }

  public getProviders(): AuthProviderPublic[] {
    return this.providers;
  }

  public setProviders(providers: AuthProviderPublic[]): void {
    this.providers = [...providers];
  }

  public onAuthChanged(cb: (user: TUser | null) => void): void {
    this.onAuthChangedCallback = cb;
  }

  public getAuthToken(): string | null {
    return getAuthToken(this.storageKey);
  }

  public setAuthToken(token: string | null): void {
    setAuthToken(token, this.storageKey);
    if (!token) {
      this.user = null;
    }
  }

  /**
   * Processes a renewed token received in the X-Renewed-Token header.
   */
  public handleRenewedToken(renewedToken: string): void {
    if (renewedToken && !isTokenExpired(renewedToken)) {
      this.setAuthToken(renewedToken);
      this.sessionExpired = false;
    }
  }

  public getUser(): TUser | null {
    return this.user;
  }

  public isAuthenticated(): boolean {
    const token = this.getAuthToken();
    return this.user !== null && !this.sessionExpired && !!token && !isTokenExpired(token);
  }

  public isSessionExpired(): boolean {
    return this.sessionExpired;
  }

  public setSessionExpired(expired: boolean): void {
    this.sessionExpired = expired;
  }

  public handleSessionExpired(): void {
    this.sessionExpired = true;
    this.setAuthToken(null);
    this.user = null;
    if (this.onAuthChangedCallback) {
      this.onAuthChangedCallback(null);
    }
  }

  public getLastAuthError(): string | null {
    return this.lastAuthError;
  }

  public getLastAuthErrorDetails(): AuthErrorDetails | null {
    return this.lastAuthErrorDetails;
  }

  public setLastAuthError(err: string | null, details?: AuthErrorDetails | null): void {
    this.lastAuthError = err;
    this.lastAuthErrorDetails = details || null;
    if (err && this.onErrorCallback) {
      this.onErrorCallback(err, this.lastAuthErrorDetails);
    }
  }

  public clearLastAuthError(): void {
    this.lastAuthError = null;
    this.lastAuthErrorDetails = null;
  }

  /**
   * Extracts any authentication token (#token=...) or error returned from the OIDC redirect.
   * Cleans the URL via history.replaceState. Returns true if a token was received and stored.
   */
  public checkUrlForToken(): boolean {
    const result = extractTokenFromUrl({ storageKey: this.storageKey });
    if (result.authError) {
      this.setLastAuthError(result.authError, result.errorDetails);
      return false;
    }
    if (result.token) {
      this.sessionExpired = false;
      this.clearLastAuthError();
      return true;
    }
    return false;
  }

  /**
   * Checks the URL for returned tokens, validates stored session, and fetches current user profile.
   */
  public async establishSession(): Promise<boolean> {
    this.checkUrlForToken();

    const token = this.getAuthToken();
    if (!token || isTokenExpired(token)) {
      this.user = null;
      return false;
    }

    const user = await this.fetchCurrentUser();
    return user !== null;
  }

  /**
   * Fetches the current user profile using the configured fetchUser handler.
   */
  public async fetchCurrentUser(): Promise<TUser | null> {
    const token = this.getAuthToken();
    if (!token || isTokenExpired(token)) {
      this.handleSessionExpired();
      return null;
    }

    if (!this.fetchUserFn) {
      return this.user;
    }

    try {
      const user = await this.fetchUserFn(token);
      if (user) {
        this.user = user;
        this.sessionExpired = false;
        if (this.onAuthChangedCallback) {
          this.onAuthChangedCallback(this.user);
        }
        return this.user;
      }
    } catch (e) {
      console.warn('[tsutils/auth] Could not fetch user profile:', e);
    }

    this.user = null;
    return null;
  }

  public async refreshCurrentUser(): Promise<TUser | null> {
    return this.fetchCurrentUser();
  }

  /**
   * Helper to retrieve a numeric role for a tenant or company from the user's role mapping.
   * Checks both user.tenantRoles and user.companyRoles.
   */
  public getRole(tenantOrCompanyId: string | number): number | null {
    if (!this.user || typeof this.user !== 'object') return null;
    const u = this.user as Record<string, unknown>;
    const roles = (u.tenantRoles || u.companyRoles) as Record<string, number> | undefined;
    if (!roles) return null;

    const idStr = String(tenantOrCompanyId);
    if (roles[idStr] !== undefined) {
      return roles[idStr];
    }
    return null;
  }

  /**
   * Builds the server login initiation URL for a given provider.
   */
  public buildLoginUrl(providerId: string, returnTo?: string): string {
    const targetReturnTo = returnTo || buildLoginReturnTo();
    const cleanPrefix = this.loginPathPrefix;
    return `${cleanPrefix}/${encodeURIComponent(providerId)}/login?return_to=${encodeURIComponent(targetReturnTo)}`;
  }

  /**
   * Redirects the browser to begin the OIDC login flow with the chosen provider.
   */
  public signinRedirect(providerId?: string, returnTo?: string): void {
    let targetProvider = providerId;
    if (!targetProvider && this.providers.length > 0) {
      targetProvider = this.providers[0].id;
    }

    if (!targetProvider) {
      const err = 'No authentication provider configured';
      console.error('[tsutils/auth]', err);
      this.setLastAuthError(err);
      return;
    }

    const url = this.buildLoginUrl(targetProvider, returnTo);
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  /** Signs out the user, clearing the stored token and user profile. */
  public signout(redirectUrl?: string): void {
    this.setAuthToken(null);
    this.user = null;
    this.sessionExpired = false;
    if (this.onAuthChangedCallback) {
      this.onAuthChangedCallback(null);
    }
    if (redirectUrl && typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }
  }

  public logout(redirectUrl?: string): void {
    this.signout(redirectUrl);
  }
}
