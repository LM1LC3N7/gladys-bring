// -----------------------------------------------------------------------------
// The only place that talks to the network: `fetch` with a timeout and an
// identifiable User-Agent. The tests replace it with `setFetch()`.
// -----------------------------------------------------------------------------

import { HTTP_TIMEOUT, USER_AGENT } from './constants.js';

let fetchImpl = (...args) => globalThis.fetch(...args);

/** Replace the fetch implementation (tests only). Returns the previous one. */
export function setFetch(impl) {
  const previous = fetchImpl;
  fetchImpl = impl;
  return previous;
}

/** The path of a URL without the identifiers it carries (they end up in logs). */
export function safePath(url) {
  return new URL(url).pathname.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id',
  );
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} on ${safePath(url)}${body ? `: ${body}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/**
 * One request. `json` is sent JSON-encoded, `form` form-encoded; resolves the
 * parsed JSON answer (the text when it is not JSON, undefined when empty),
 * throws an HttpError on a non-2xx status. The request body never appears in
 * an error: it may carry the password.
 */
export async function request(
  url,
  { method = 'GET', headers = {}, json, form, timeout = HTTP_TIMEOUT } = {},
) {
  const init = {
    method,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(Math.max(1, timeout)),
  };
  if (form !== undefined) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    init.body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 200);
    try {
      message = JSON.parse(text).message ?? message;
    } catch {
      // not JSON ("Invalid Email." comes as text/plain)
    }
    throw new HttpError(response.status, url, message);
  }
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
