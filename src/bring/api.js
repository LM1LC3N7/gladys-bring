// -----------------------------------------------------------------------------
// The Bring! client: the unofficial API of the Bring! web app
// (https://api.getbring.com/rest/), as the `bring-api` library used by the
// Home Assistant integration calls it. Every method resolves raw JSON:
// turning it into values is ./model.js's job.
//
// Sign-in: `POST v2/bringauth` with the email and the password gives the
// user uuid, an access token (Bearer) and a refresh token. The session (uuid
// + refresh token) is handed to `onSession` to be kept in the Gladys config,
// so a restart renews the access token with `POST v2/bringauth/token`
// instead of sending the password again. A refused refresh token falls back
// to the password once; a refused password is final until the configuration
// changes (no retry loop that could lock the account).
// -----------------------------------------------------------------------------

import { TOKEN_MARGIN } from '../constants.js';
import { HttpError, request } from '../http.js';
import { authOf } from './model.js';

export const BRING_API_URL = 'https://api.getbring.com/rest/';
export const BRING_LOCALES_URL = 'https://web.getbring.com/locale/';

/** The public key of the Bring! web app, the same for every user. */
const API_KEY = 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp';
const DEFAULT_COUNTRY = 'DE';

export class BringError extends Error {
  /**
   * `code`: bad_email | bad_credentials (final until the config changes),
   * session (refresh token refused), unauthorized, not_found, timeout,
   * network, http_<status>.
   */
  constructor(code, message) {
    super(message);
    this.name = 'BringError';
    this.code = code;
  }

  get final() {
    return this.code === 'bad_email' || this.code === 'bad_credentials';
  }
}

function wrap(err) {
  if (err instanceof BringError) {
    return err;
  }
  if (err instanceof HttpError) {
    if (err.status === 401) {
      return new BringError('unauthorized', 'Bring! refused the session');
    }
    if (err.status === 404) {
      return new BringError('not_found', `Bring! does not know this list or user (${err.message})`);
    }
    return new BringError(`http_${err.status}`, `Bring! answered ${err.message}`);
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new BringError('timeout', 'Bring! did not answer in time');
  }
  return new BringError('network', err?.message ?? String(err));
}

export class BringClient {
  constructor({
    email,
    password,
    session,
    onSession = async () => {},
    now = Date.now,
    baseUrl = BRING_API_URL,
    localesUrl = BRING_LOCALES_URL,
  }) {
    this.email = email;
    this.password = password;
    // A session stored for another email is not this account's.
    this.session =
      session && String(session.email ?? '').toLowerCase() === String(email).toLowerCase()
        ? { ...session }
        : undefined;
    this.onSession = onSession;
    this.now = now;
    this.baseUrl = baseUrl;
    this.localesUrl = localesUrl;
    this.country = DEFAULT_COUNTRY;
    this.authorization = undefined;
    this.expiresAt = 0;
    this.authenticating = undefined;
    this.refused = undefined;
  }

  /** The user uuid, once signed in. */
  get uuid() {
    return this.session?.uuid;
  }

  /** The list Bring! opens by default for this user (from the sign-in). */
  get defaultListUuid() {
    return this.session?.listUuid ?? null;
  }

  /** The headers of every call; the sign-in sends only the app ones, like the library. */
  headers({ signIn = false } = {}) {
    const headers = {
      'X-BRING-API-KEY': API_KEY,
      // The header the bring-api library (Home Assistant) sends every day: the
      // best-tested combination with this API key.
      'X-BRING-CLIENT': 'android',
      'X-BRING-APPLICATION': 'bring',
      'X-BRING-COUNTRY': this.country,
    };
    if (signIn) {
      return headers;
    }
    if (this.session?.uuid) {
      headers['X-BRING-USER-UUID'] = this.session.uuid;
    }
    if (this.session?.publicUuid) {
      headers['X-BRING-PUBLIC-USER-UUID'] = this.session.publicUuid;
    }
    if (this.authorization) {
      headers.Authorization = this.authorization;
    }
    return headers;
  }

  /** Adopt a renewed session and hand it over to be persisted. */
  async adopt(session) {
    this.session = session;
    await this.onSession({ ...session });
  }

  // --- Authentication ----------------------------------------------------------------

  async login() {
    if (this.refused) {
      throw this.refused;
    }
    let answer;
    try {
      answer = await request(`${this.baseUrl}v2/bringauth`, {
        method: 'POST',
        headers: this.headers({ signIn: true }),
        form: { email: this.email, password: this.password },
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) {
        this.refused = new BringError('bad_email', 'Bring! refused the email address');
      } else if (err instanceof HttpError && err.status === 401) {
        this.refused = new BringError('bad_credentials', 'Bring! refused the email or password');
      }
      throw this.refused ?? wrap(err);
    }
    const auth = authOf(answer);
    if (!auth.uuid || !auth.accessToken) {
      throw new BringError('http_200', 'Bring! answered the sign-in without a session');
    }
    this.authorization = `${auth.tokenType} ${auth.accessToken}`;
    this.expiresAt = this.now() + auth.expiresIn * 1000;
    await this.adopt({
      email: this.email,
      uuid: auth.uuid,
      publicUuid: auth.publicUuid,
      listUuid: auth.listUuid,
      refreshToken: auth.refreshToken ?? '',
    });
  }

  async renew() {
    let answer;
    try {
      answer = await request(`${this.baseUrl}v2/bringauth/token`, {
        method: 'POST',
        headers: this.headers(),
        form: { grant_type: 'refresh_token', refresh_token: this.session.refreshToken },
      });
    } catch (err) {
      if (err instanceof HttpError && (err.status === 400 || err.status === 401)) {
        throw new BringError('session', 'Bring! refused the stored session');
      }
      throw wrap(err);
    }
    const auth = authOf(answer);
    if (!auth.accessToken) {
      throw new BringError('session', 'Bring! renewed the session without an access token');
    }
    this.authorization = `${auth.tokenType} ${auth.accessToken}`;
    this.expiresAt = this.now() + auth.expiresIn * 1000;
    if (auth.refreshToken && auth.refreshToken !== this.session.refreshToken) {
      await this.adopt({ ...this.session, refreshToken: auth.refreshToken });
    }
  }

  /** A valid access token: kept, renewed with the refresh token, or signed in. Single-flight. */
  async authenticate({ force = false } = {}) {
    if (!force && this.authorization && this.now() < this.expiresAt - TOKEN_MARGIN) {
      return;
    }
    if (!this.authenticating) {
      this.authenticating = (async () => {
        this.authorization = undefined;
        if (this.session?.refreshToken) {
          try {
            await this.renew();
            return;
          } catch (err) {
            if (err.code !== 'session') {
              throw err;
            }
          }
        }
        await this.login();
      })().finally(() => {
        this.authenticating = undefined;
      });
    }
    await this.authenticating;
  }

  /** One authenticated call, retried once with a renewed token on a 401. */
  async call(method, path, { json, retry = true } = {}) {
    await this.authenticate();
    try {
      return await request(`${this.baseUrl}${path}`, { method, headers: this.headers(), json });
    } catch (err) {
      if (err instanceof HttpError && err.status === 401 && retry) {
        await this.authenticate({ force: true });
        return this.call(method, path, { json, retry: false });
      }
      throw wrap(err);
    }
  }

  // --- The API ---------------------------------------------------------------------------

  /** { lists: [{ listUuid, name, theme }] }. */
  async lists() {
    await this.authenticate();
    return this.call('GET', `bringusers/${encodeURIComponent(this.uuid)}/lists`);
  }

  /** { uuid, status, items: { purchase: [...], recently: [...] } } (or the older flat shape). */
  items(listUuid) {
    return this.call('GET', `v2/bringlists/${encodeURIComponent(listUuid)}`);
  }

  /** { usersettings: [{ key, value }], userlistsettings: [{ listUuid, usersettings }] }. */
  async userSettings() {
    await this.authenticate();
    return this.call('GET', `bringusersettings/${encodeURIComponent(this.uuid)}`);
  }

  /** { userLocale: { language, country }, ... }. */
  async account() {
    await this.authenticate();
    return this.call('GET', `v2/bringusers/${encodeURIComponent(this.uuid)}`);
  }

  /** Apply item changes (see changeOf in ./model.js). */
  change(listUuid, changes) {
    return this.call('PUT', `v2/bringlists/${encodeURIComponent(listUuid)}/items`, {
      json: { changes, sender: '' },
    });
  }

  /** The article translations of a locale: { "Milch": "Lait", ... }. No session needed. */
  async articles(locale) {
    try {
      return await request(`${this.localesUrl}articles.${encodeURIComponent(locale)}.json`);
    } catch (err) {
      throw wrap(err);
    }
  }
}
