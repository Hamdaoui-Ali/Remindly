import { GmailDeliveryError } from './errors';

export interface GmailOAuthOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GmailOAuthClient {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GmailOAuthOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.expiresAt - Date.now() > 60_000) return this.accessToken;

    let response: Response;
    try {
      response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          refresh_token: this.options.refreshToken,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 8_000),
      });
    } catch {
      throw new GmailDeliveryError('provider_unavailable', 'gmail_oauth_transport', 'unknown_outcome');
    }

    const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !body.access_token) {
      if (body.error === 'invalid_grant') {
        throw new GmailDeliveryError('auth_revoked', 'gmail_auth_invalid_grant', 'definite_failure');
      }
      throw new GmailDeliveryError('auth_revoked', 'gmail_oauth_failed', 'definite_failure');
    }

    this.accessToken = body.access_token;
    this.expiresAt = Date.now() + (body.expires_in ?? 3600) * 1_000;
    return body.access_token;
  }
}

