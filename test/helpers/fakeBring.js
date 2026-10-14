// -----------------------------------------------------------------------------
// A fake Bring! for the tests: replaces `fetch`, answers the API routes from
// a mutable state (the lists change like Bring! changes them), records every
// call, and fails loudly on an unexpected URL. No test touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export function fixture(name) {
  const text = readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  return name.endsWith('.json') ? JSON.parse(text) : text;
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export const text = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });
export const empty = (status = 204) => new Response(null, { status });

export const COURSES = '11111111-aaaa-4bbb-8ccc-000000000001';
export const WEEKEND = '22222222-aaaa-4bbb-8ccc-000000000002';
export const USER = '9a4e2f10-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

/** The account as Bring! serves it; every field can be edited by a test. */
export function bringState() {
  return {
    auth: fixture('auth.json'),
    token: fixture('token.json'),
    lists: fixture('lists.json'),
    items: { [COURSES]: fixture('items-courses.json'), [WEEKEND]: fixture('items-weekend.json') },
    settings: fixture('usersettings.json'),
    account: fixture('account.json'),
    articles: { 'fr-FR': fixture('articles.fr-FR.json'), 'en-US': fixture('articles.en-US.json') },
    /** Answers of the sign-in and of the token renewal (overridable). */
    login: (state) => json(state.auth),
    renew: (state) => json(state.token),
    /** (call) => Response | undefined: an error injected before the routes. */
    fail: () => undefined,
  };
}

/** What Bring! does with the changes of PUT v2/bringlists/{uuid}/items. */
function applyChanges(list, changes) {
  const items = list.items;
  for (const change of changes) {
    const others = (array) => array.filter((i) => i.itemId !== change.itemId);
    const current = items.purchase.find((i) => i.itemId === change.itemId);
    if (change.operation === 'TO_PURCHASE') {
      items.recently = others(items.recently);
      if (current) {
        current.specification = change.spec;
      } else {
        items.purchase.push({
          uuid: change.uuid ?? randomUUID(),
          itemId: change.itemId,
          specification: change.spec,
          attributes: [],
        });
      }
    } else if (change.operation === 'TO_RECENTLY') {
      items.purchase = others(items.purchase);
      items.recently = [
        current ?? { uuid: randomUUID(), itemId: change.itemId, specification: change.spec },
        ...others(items.recently),
      ];
    } else if (change.operation === 'REMOVE') {
      items.purchase = others(items.purchase);
      items.recently = others(items.recently);
    }
  }
}

function route(state, call) {
  const { method, path } = call;
  if (method === 'POST' && path === '/rest/v2/bringauth') {
    return state.login(state, call);
  }
  if (method === 'POST' && path === '/rest/v2/bringauth/token') {
    return state.renew(state, call);
  }
  let match = /^\/rest\/bringusers\/([^/]+)\/lists$/.exec(path);
  if (method === 'GET' && match) {
    return json(state.lists);
  }
  match = /^\/rest\/v2\/bringlists\/([^/]+)$/.exec(path);
  if (method === 'GET' && match) {
    const list = state.items[match[1]];
    return list ? json(list) : json({ message: 'not found' }, 404);
  }
  match = /^\/rest\/v2\/bringlists\/([^/]+)\/items$/.exec(path);
  if (method === 'PUT' && match) {
    applyChanges(state.items[match[1]], call.json.changes);
    return empty();
  }
  if (method === 'GET' && /^\/rest\/bringusersettings\/[^/]+$/.test(path)) {
    return json(state.settings);
  }
  if (method === 'GET' && /^\/rest\/v2\/bringusers\/[^/]+$/.test(path)) {
    return json(state.account);
  }
  match = /^\/locale\/articles\.([a-zA-Z-]+)\.json$/.exec(path);
  if (method === 'GET' && match) {
    const articles = state.articles[match[1]];
    return articles ? json(articles) : text('AccessDenied', 403);
  }
  return undefined;
}

/** Install the fake Bring!; returns { state, calls, restore }. */
export function installBring(state = bringState()) {
  const calls = [];
  const previous = setFetch(async (url, init = {}) => {
    const parsed = new URL(url);
    const isForm = String(init.headers?.['Content-Type'] ?? '').startsWith(
      'application/x-www-form-urlencoded',
    );
    const call = {
      method: init.method ?? 'GET',
      url,
      host: parsed.host,
      path: parsed.pathname,
      headers: init.headers ?? {},
      form: isForm ? Object.fromEntries(new URLSearchParams(init.body)) : undefined,
      json: !isForm && init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = state.fail(call) ?? route(state, call);
    if (!answer) {
      throw new Error(`Unexpected network call in a test: ${call.method} ${url}`);
    }
    return answer;
  });
  return {
    state,
    calls,
    /** The calls to one route, e.g. count('PUT', /items$/). */
    count: (method, pattern) =>
      calls.filter((c) => c.method === method && pattern.test(c.path)).length,
    restore: () => setFetch(previous),
  };
}
