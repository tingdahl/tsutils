import { PanelHandler } from '../ui/index.js';
import { escapeHtml } from '../html/index.js';
import { getProviderIconSVG } from './icons.js';
import type { AuthManager } from './manager.js';

export interface SignInPanelHandlerOptions {
  buttonsContainerId?: string;
  errorContainerId?: string;
  singleLinkId?: string;
  buttonClass?: string;
  errorBannerClass?: string;
}

/**
 * Handles rendering of SSO provider sign-in buttons and authentication error messages.
 */
export class SignInPanelHandler extends PanelHandler {
  private authManager?: AuthManager<any>;
  private options: SignInPanelHandlerOptions;

  constructor(
    authManager?: AuthManager<any>,
    panelId: string = 'sign-in-panel',
    options?: SignInPanelHandlerOptions
  ) {
    super(panelId);
    this.authManager = authManager;
    this.options = {
      buttonsContainerId: 'sign-in-buttons-container',
      errorContainerId: 'auth-error-banner',
      singleLinkId: 'sign-in-link',
      buttonClass: 'sso-sign-in-btn',
      errorBannerClass: 'auth-error-banner',
      ...options,
    };
  }

  override async init(): Promise<void> {
    this.render();
  }

  override async refresh(): Promise<void> {
    await super.refresh();
    this.render();
  }

  public render(): void {
    this.renderError();
    this.renderButtons();
  }

  public renderError(): void {
    if (typeof document === 'undefined' || !this.authManager) return;
    const errorMsg = this.authManager.getLastAuthError();
    const errorContainer = document.getElementById(this.options.errorContainerId!);
    if (!errorContainer) return;

    if (!errorMsg) {
      errorContainer.innerHTML = '';
      errorContainer.style.display = 'none';
      return;
    }

    errorContainer.style.display = '';
    errorContainer.innerHTML = `<div class="auth-notice-banner auth-notice-error" role="alert"><span>${escapeHtml(errorMsg)}</span></div>`;
  }

  public renderButtons(): void {
    if (typeof document === 'undefined' || !this.authManager) return;
    const container = document.getElementById(this.options.buttonsContainerId!) || document.getElementById(this.id);
    if (!container) return;

    const providers = this.authManager.getProviders();
    if (providers.length === 0) {
      const singleLink = document.getElementById(this.options.singleLinkId!);
      if (singleLink) {
        singleLink.onclick = (e) => {
          e.preventDefault();
          this.authManager?.signinRedirect();
        };
      }
      return;
    }

    // Render multi-provider SSO buttons
    container.innerHTML = '';
    for (const provider of providers) {
      const btn = document.createElement('button');
      btn.className = this.options.buttonClass!;
      btn.type = 'button';
      btn.innerHTML = getProviderIconSVG(provider.icon, provider.id);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = provider.name;
      btn.appendChild(document.createTextNode(' '));
      btn.appendChild(nameSpan);
      btn.onclick = (e) => {
        e.preventDefault();
        this.authManager?.signinRedirect(provider.id);
      };
      container.appendChild(btn);
    }
  }
}
