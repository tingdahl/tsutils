import { escapeHtml } from '../html/index.js';

export const GOOGLE_SVG_ICON = `<svg class="sso-icon" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.59.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>`;

export const MICROSOFT_SVG_ICON = `<svg class="sso-icon" width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>`;

export const APPLE_SVG_ICON = `<svg class="sso-icon" width="18" height="18" viewBox="0 0 170 170" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-5.87-8.91-10.45-19.04-13.73-30.39-3.28-11.35-4.92-22.18-4.92-32.48 0-14.54 3.75-26.69 11.26-36.46 7.51-9.76 16.94-14.77 28.3-15.02 4.92 0 10.36 1.28 16.32 3.84 5.96 2.56 9.8 3.89 11.53 3.89 1.52 0 5.48-1.33 11.88-3.99 6.4-2.66 11.96-3.84 16.68-3.56 12.8.63 22.84 5.27 30.12 13.91-11.07 6.74-16.48 16.03-16.23 27.87.25 9.38 3.85 17.26 10.79 23.63 6.94 6.38 15.11 10.02 24.51 10.95-2.03 6.09-4.38 12.18-7.05 18.28zM119.22 33.15c0-6.72 2.37-12.98 7.11-18.79 4.74-5.81 10.66-9.67 17.76-11.58.5 2.16.76 4.3.76 6.42 0 6.6-2.45 12.97-7.35 19.1-4.9 6.13-10.94 9.92-18.12 11.36-.08-2.2-.16-4.37-.16-6.51z"/></svg>`;

export const SSO_GENERIC_SVG_ICON = `<svg class="sso-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

/**
 * Returns safe SVG markup or an <img> tag for an authentication provider icon.
 * Custom SVG markup is never rendered directly as markup; instead it is encoded as a data URL
 * to prevent script execution.
 */
export function getProviderIconSVG(iconName?: string, providerId?: string): string {
  const key = (iconName || providerId || '').toLowerCase();
  if (key.includes('google')) return GOOGLE_SVG_ICON;
  if (key.includes('microsoft') || key.includes('azure') || key.includes('entra')) return MICROSOFT_SVG_ICON;
  if (key.includes('apple')) return APPLE_SVG_ICON;
  if (iconName) {
    const src = providerIconSrc(iconName.trim());
    if (src) {
      return `<img src="${escapeHtml(src)}" alt="" class="sso-icon" width="18" height="18" />`;
    }
  }
  return SSO_GENERIC_SVG_ICON;
}

/**
 * Maps a configured provider icon to an <img> source, or null if not allowed.
 * Custom icons are never injected as markup: inline SVG becomes a data: URL, because scripts and
 * event handlers inside an image are not executed by the browser.
 */
export function providerIconSrc(icon: string): string | null {
  const lower = icon.toLowerCase();
  if (lower.startsWith('<svg')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`;
  }
  if (lower.startsWith('https://') || (icon.startsWith('/') && !icon.startsWith('//'))) {
    return icon;
  }
  if (/^data:image\/(png|jpeg|gif|webp);/.test(lower)) {
    return icon;
  }
  return null;
}

export interface AuthProviderPublic {
  id: string;
  name: string;
  icon?: string;
  authority?: string;
  client_id?: string;
  redirect_path?: string;
}

export interface OIDCConfig {
  auth_providers: AuthProviderPublic[];
}
