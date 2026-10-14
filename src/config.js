// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// The Bring! session lives in the same config object under an off-schema key
// (SESSION_KEY): it is read here too, never shown in the UI.
// -----------------------------------------------------------------------------

import { SESSION_KEY } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  poll_minutes: 2,
  watch_lists: true,
};

const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value !== null
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The stored session: { email, uuid, publicUuid, refreshToken, listUuid }, or
 * undefined when absent or unreadable (a fresh sign-in then recreates it).
 */
export function parseSession(raw) {
  if (typeof raw !== 'string' || !raw) {
    return undefined;
  }
  try {
    const session = JSON.parse(raw);
    return session && typeof session.uuid === 'string' && typeof session.refreshToken === 'string'
      ? session
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeConfig(raw = {}) {
  return {
    email: text(raw.email),
    /** Sent to Bring! only, never logged. */
    password: typeof raw.password === 'string' ? raw.password : '',
    pollMinutes: number(raw.poll_minutes, DEFAULTS.poll_minutes, 1, 60),
    watchLists: raw.watch_lists !== false && raw.watch_lists !== 'false',
    session: parseSession(raw[SESSION_KEY]),
  };
}

/** The config keys that restart the integration when they change. */
export function configFingerprint(raw = {}) {
  const { [SESSION_KEY]: _session, ...rest } = raw ?? {};
  return JSON.stringify(rest, Object.keys(rest).sort());
}
