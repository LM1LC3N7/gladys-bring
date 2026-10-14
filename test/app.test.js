// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake Bring!.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BringApp } from '../src/app.js';
import {
  ACTIONS,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  SESSION_KEY,
  WIDGETS,
  WIDGET_ACTIONS,
} from '../src/constants.js';
import {
  COURSES,
  USER,
  WEEKEND,
  bringState,
  fixture,
  installBring,
  json,
  text,
} from './helpers/fakeBring.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const NOW = Date.parse('2026-10-14T08:00:00Z');
const PASSWORD = 's3cret-pa55';
const CONFIG = { email: 'user@example.com', password: PASSWORD };
const SESSION = {
  email: 'user@example.com',
  uuid: USER,
  publicUuid: '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e',
  listUuid: COURSES,
  refreshToken: 'refresh-token-0',
};

let bring;
afterEach(() => bring?.restore());

async function setup({ config = CONFIG, state = bringState() } = {}) {
  bring = installBring(state);
  const gladys = createFakeGladys({ selector: 'bring', config });
  const timers = createFakeTimers();
  const clock = { now: NOW };
  const logs = [];
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args) => logs.push(`${level} ${args.join(' ')}`),
    ]),
  );
  const app = new BringApp({ gladys, logger, now: () => clock.now, timers });
  // What index.js wires.
  gladys.onSceneAction(SCENE_ACTIONS.ADD, (f) => app.addItem(f));
  gladys.onSceneAction(SCENE_ACTIONS.COMPLETE, (f) => app.completeItem(f));
  gladys.onSceneAction(SCENE_ACTIONS.REMOVE, (f) => app.removeItem(f));
  gladys.onSceneAction(SCENE_ACTIONS.READ, (f) => app.getList(f));
  gladys.onWidgetGet(WIDGETS.LIST, (request) => app.getWidget(request));
  gladys.onWidgetAction(WIDGETS.LIST, (key, params, ctx) => app.widgetAction(key, params, ctx));
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.onConfigUpdated((c) => app.configUpdated(c));
  await gladys.connect();
  return { app, gladys, timers, clock, state, logs };
}

const session = (gladys) => JSON.parse(gladys.fake.config[SESSION_KEY]);
const puts = () => bring.calls.filter((c) => c.method === 'PUT').map((c) => c.json.changes[0]);

test('not configured: the status says so and nothing is read', async () => {
  const { app, gladys, timers } = await setup({ config: {} });
  await app.start({ email: 'user@example.com' });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Saisissez l’e-mail/);
  assert.equal(bring.calls.length, 0);
  assert.equal(timers.intervals().length, 0);
  const widget = (await gladys.fake.widgetGet(WIDGETS.LIST, { settings: {} })).data.content;
  assert.match(widget.components[1].text.en, /Configure your Bring! account/);
  const action = await gladys.fake.sceneAction(SCENE_ACTIONS.READ, {});
  assert.equal(action.success, false);
});

test('first start: signs in, keeps the session, reads every list, fires nothing', async () => {
  const { app, gladys, timers } = await setup();
  await app.start(CONFIG);
  const [login] = bring.calls;
  assert.equal(login.path, '/rest/v2/bringauth');
  assert.deepEqual(login.form, { email: 'user@example.com', password: PASSWORD });
  assert.equal(login.headers['X-BRING-API-KEY'], 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp');
  assert.equal(login.headers['X-BRING-CLIENT'], 'webApp');
  assert.equal(login.headers['X-BRING-APPLICATION'], 'bring');
  // The session is kept off-schema, without the password nor the access token.
  assert.deepEqual(session(gladys), {
    email: 'user@example.com',
    uuid: USER,
    publicUuid: SESSION.publicUuid,
    listUuid: COURSES,
    refreshToken: 'refresh-token-1',
  });
  const items = bring.calls.find((c) => c.path === `/rest/v2/bringlists/${COURSES}`);
  assert.equal(items.headers.Authorization, 'Bearer access-token-1');
  assert.equal(items.headers['X-BRING-USER-UUID'], USER);
  assert.equal(items.headers['X-BRING-COUNTRY'], 'FR', 'the country of the account');
  assert.deepEqual(
    bring.calls.filter((c) => c.host === 'web.getbring.com').map((c) => c.path),
    ['/locale/articles.fr-FR.json', '/locale/articles.en-US.json'],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /2 lists \(Courses, Weekend\)/);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'nothing on the first reading');
  assert.equal(timers.intervals()[0].ms, 120_000);
});

test('a stored session renews the token instead of sending the password', async () => {
  const config = { ...CONFIG, [SESSION_KEY]: JSON.stringify(SESSION) };
  const { app, gladys } = await setup({ config });
  await app.start(config);
  assert.equal(bring.count('POST', /bringauth$/), 0);
  const renew = bring.calls.find((c) => c.path === '/rest/v2/bringauth/token');
  assert.deepEqual(renew.form, { grant_type: 'refresh_token', refresh_token: 'refresh-token-0' });
  assert.equal(renew.headers['X-BRING-USER-UUID'], USER);
  assert.equal(session(gladys).refreshToken, 'refresh-token-2', 'the rotated token is saved');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  // A session stored for another email is ignored.
  const other = { ...config, email: 'someone@example.com' };
  await app.start(other);
  assert.equal(bring.count('POST', /bringauth$/), 1);
});

test('a refused session falls back to the password once', async () => {
  const state = bringState();
  state.renew = () => json(fixture('refresh-401.json'), 401);
  const config = { ...CONFIG, [SESSION_KEY]: JSON.stringify(SESSION) };
  const { app, gladys } = await setup({ config, state });
  await app.start(config);
  assert.equal(bring.count('POST', /bringauth\/token$/), 1);
  assert.equal(bring.count('POST', /bringauth$/), 1);
  const login = bring.calls.find((c) => c.path === '/rest/v2/bringauth');
  assert.equal(login.headers['X-BRING-USER-UUID'], undefined, 'no stale session on sign-in');
  assert.equal(session(gladys).refreshToken, 'refresh-token-1');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a refused password stops everything until the configuration changes', async () => {
  const state = bringState();
  state.login = () => json(fixture('login-401.json'), 401);
  const { app, gladys, timers } = await setup({ state });
  await app.start(CONFIG);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the email or the password/);
  assert.equal(timers.intervals().length, 0);
  // No second attempt from a scene, the widget or the test button.
  assert.equal((await gladys.fake.sceneAction(SCENE_ACTIONS.READ, {})).success, false);
  await gladys.fake.widgetGet(WIDGETS.LIST, { settings: {} });
  const test = await gladys.fake.action(ACTIONS.TEST);
  assert.match(test.data.message.en, /bad_credentials/);
  assert.equal(bring.count('POST', /bringauth$/), 1);
  // Fixed in the configuration: signs in again.
  state.login = (s) => json(s.auth);
  await gladys.fake.configUpdated({ ...CONFIG, password: 'right' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  // An invalid email is told apart (Bring! answers 400 "Invalid Email.").
  state.login = () => text(fixture('login-400.txt'), 400);
  await gladys.fake.configUpdated({ ...CONFIG, email: 'not-an-email' });
  assert.match(gladys.fake.connectionStatus.message.fr, /refusé l’adresse e-mail/);
});

test('the watched lists fire item added, item checked off and list emptied', async () => {
  const { app, gladys, timers, state } = await setup();
  await app.start(CONFIG);
  const courses = state.items[COURSES].items;
  // In the Bring! app: sugar added, the milk checked off.
  courses.purchase.push({ uuid: 'n1', itemId: 'Zucker', specification: '1 kg' });
  courses.recently.unshift(courses.purchase.shift());
  await timers.runIntervals();
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.ADDED,
      data: { list: 'Courses', item: 'Sucre', specification: '1 kg', count: 3 },
    },
    {
      key: SCENE_TRIGGERS.CHECKED_OFF,
      data: { list: 'Courses', item: 'Lait', specification: '2 l', count: 3 },
    },
  ]);
  assert.ok(gladys.fake.widgetRefreshes.includes(WIDGETS.LIST));
  // Shopping done: everything checked off, the bulbs removed.
  courses.recently.unshift(...courses.purchase.filter((i) => i.itemId !== 'Ampoules LED'));
  courses.purchase = [];
  await timers.runIntervals();
  const keys = gladys.fake.sceneEvents.slice(2).map((e) => [e.key, e.data.item ?? e.data.list]);
  assert.deepEqual(keys, [
    [SCENE_TRIGGERS.CHECKED_OFF, 'Pain'],
    [SCENE_TRIGGERS.CHECKED_OFF, 'Sucre'],
    [SCENE_TRIGGERS.EMPTIED, 'Courses'],
  ]);
  await timers.runIntervals();
  assert.equal(gladys.fake.sceneEvents.length, 5, 'one event per transition');
  // The list of lists is read once an hour, not at every refresh.
  assert.equal(bring.count('GET', /\/lists$/), 1);
});

test('add_item sends the catalog key, reads the list back and fires nothing for itself', async () => {
  const { app, gladys } = await setup();
  await app.start(CONFIG);
  const reads = bring.count('GET', new RegExp(`bringlists/${COURSES}$`));
  const added = await gladys.fake.sceneAction(SCENE_ACTIONS.ADD, {
    list: 'courses',
    item: 'sucre',
    specification: '1 kg',
  });
  assert.equal(added.success, true);
  assert.deepEqual(added.data.outputs, { list: 'Courses', item: 'Sucre', count: 4 });
  assert.deepEqual(puts()[0], {
    accuracy: '0.0',
    altitude: '0.0',
    latitude: '0.0',
    longitude: '0.0',
    itemId: 'Zucker',
    spec: '1 kg',
    uuid: null,
    operation: 'TO_PURCHASE',
  });
  assert.equal(bring.count('GET', new RegExp(`bringlists/${COURSES}$`)), reads + 1, 'read back');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'no loop through the integration');
  // Free text as is; the default list; an English list.
  await gladys.fake.sceneAction(SCENE_ACTIONS.ADD, { item: 'Piles AA' });
  assert.equal(puts()[1].itemId, 'Piles AA');
  assert.equal(bring.calls.at(-2).path, `/rest/v2/bringlists/${COURSES}/items`);
  await gladys.fake.sceneAction(SCENE_ACTIONS.ADD, { list: 'Weekend', item: 'Milk' });
  assert.equal(puts()[2].itemId, 'Milch');
  const unknown = await gladys.fake.sceneAction(SCENE_ACTIONS.ADD, { list: 'Atlantis', item: 'x' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Unknown Bring! list "Atlantis"/);
});

test('complete_item and remove_item act on the item found on the list', async () => {
  const { app, gladys } = await setup();
  await app.start(CONFIG);
  const done = await gladys.fake.sceneAction(SCENE_ACTIONS.COMPLETE, { item: 'LAIT' });
  assert.deepEqual(done.data.outputs, { list: 'Courses', item: 'Lait', done: true, count: 2 });
  assert.deepEqual(
    [puts()[0].itemId, puts()[0].spec, puts()[0].uuid, puts()[0].operation],
    ['Milch', '2 l', 'a0000001-0000-4000-8000-000000000001', 'TO_RECENTLY'],
  );
  const removed = await gladys.fake.sceneAction(SCENE_ACTIONS.REMOVE, { item: 'ampoules led' });
  assert.equal(removed.data.outputs.done, true);
  assert.deepEqual(
    [puts()[1].itemId, puts()[1].spec, puts()[1].operation],
    ['Ampoules LED', '', 'REMOVE'],
  );
  const missing = await gladys.fake.sceneAction(SCENE_ACTIONS.COMPLETE, { item: 'Caviar' });
  assert.deepEqual(missing.data.outputs, {
    list: 'Courses',
    item: 'Caviar',
    done: false,
    count: 1,
  });
  assert.equal(puts().length, 2, 'nothing sent for an item that is not on the list');
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('get_list gives the count and the items as one text', async () => {
  const { app, gladys } = await setup();
  await app.start(CONFIG);
  const read = await gladys.fake.sceneAction(SCENE_ACTIONS.READ, { list: 'Courses' });
  assert.deepEqual(read.data.outputs, {
    list: 'Courses',
    count: 3,
    items: 'Lait (2 l), Pain, Ampoules LED (E27)',
  });
  const weekend = await gladys.fake.sceneAction(SCENE_ACTIONS.READ, { list: 'weekend' });
  assert.equal(weekend.data.outputs.items, 'Beer (6)');
});

test('the widget shows a list; its buttons add and check off items', async () => {
  const { app, gladys } = await setup();
  await app.start(CONFIG);
  const settings = { list: 'Courses', quick_item: 'Lait' };
  const reads = bring.calls.length;
  const content = (await gladys.fake.widgetGet(WIDGETS.LIST, { settings })).data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text, 'Courses');
  assert.equal(bring.calls.length, reads, 'the watched reading is reused');
  const add = await gladys.fake.widgetAction(
    WIDGETS.LIST,
    WIDGET_ACTIONS.ADD,
    {},
    {
      settings,
      values: { item: 'tomates', specification: '' },
    },
  );
  assert.equal(add.data.message.fr, 'Tomates ajouté');
  assert.equal(puts()[0].itemId, 'Tomaten');
  const check = await gladys.fake.widgetAction(
    WIDGETS.LIST,
    WIDGET_ACTIONS.CHECK_OFF,
    {},
    {
      settings,
      values: { item: 'Milch' },
    },
  );
  assert.equal(check.data.message.en, 'Lait checked off');
  const quick = await gladys.fake.widgetAction(
    WIDGETS.LIST,
    WIDGET_ACTIONS.QUICK_ADD,
    {},
    {
      settings,
    },
  );
  assert.equal(quick.data.message.en, 'Lait added');
  assert.deepEqual(
    puts().map((c) => [c.itemId, c.operation]),
    [
      ['Tomaten', 'TO_PURCHASE'],
      ['Milch', 'TO_RECENTLY'],
      ['Milch', 'TO_PURCHASE'],
    ],
  );
  assert.equal(gladys.fake.sceneEvents.length, 0);
  // An older core drops the form: refused, nothing sent.
  const old = await gladys.fake.widgetAction(WIDGETS.LIST, WIDGET_ACTIONS.ADD, {}, { settings });
  assert.match(old.data.message.en, /needs Gladys 5\.2/);
  assert.equal(puts().length, 3);
  const unknown = (await gladys.fake.widgetGet(WIDGETS.LIST, { settings: { list: 'Atlantis' } }))
    .data.content;
  assert.match(unknown.components[1].text.en, /The lists are: Courses, Weekend/);
});

test('a 401 renews the token and retries the call once', async () => {
  const { app, gladys, timers, state } = await setup();
  await app.start(CONFIG);
  let refused = false;
  state.fail = (call) => {
    if (!refused && call.method === 'GET' && call.path.includes('/bringlists/')) {
      refused = true;
      return json({ message: 'token expired', error: 'invalid_token' }, 401);
    }
    return undefined;
  };
  await timers.runIntervals();
  assert.equal(bring.count('POST', /bringauth\/token$/), 1);
  assert.equal(bring.calls.at(-1).headers.Authorization, 'Bearer access-token-2');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('Bring! down: the status says so and the loop keeps running', async () => {
  const state = bringState();
  state.fail = (call) =>
    call.host === 'api.getbring.com' ? text('Service Unavailable', 503) : undefined;
  const { app, gladys, timers } = await setup({ state });
  await app.start(CONFIG);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable: Bring! answered HTTP 503/);
  assert.equal(timers.intervals().length, 1);
  state.fail = () => undefined;
  await timers.runIntervals();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a list deleted in the app is dropped without an error', async () => {
  const { app, gladys, timers, state } = await setup();
  await app.start(CONFIG);
  delete state.items[WEEKEND];
  state.lists.lists = state.lists.lists.filter((l) => l.listUuid !== WEEKEND);
  await timers.runIntervals();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  await timers.runIntervals();
  assert.equal(bring.count('GET', /\/lists$/), 2, 'the lists are read again');
  assert.match(gladys.fake.connectionStatus.message.en, /1 list \(Courses\)/);
});

test('a missing translation file leaves the names as Bring! stores them', async () => {
  const state = bringState();
  delete state.articles['fr-FR'];
  const { app, gladys } = await setup({ state });
  await app.start(CONFIG);
  const read = await gladys.fake.sceneAction(SCENE_ACTIONS.READ, { list: 'Courses' });
  assert.equal(read.data.outputs.items, 'Milch (2 l), Brot, Ampoules LED (E27)');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('without watching, nothing runs in the background', async () => {
  const { app, gladys, timers, state } = await setup();
  await app.start({ ...CONFIG, watch_lists: false });
  assert.equal(timers.intervals().length, 0);
  assert.equal(bring.count('GET', /bringlists\//), 0, 'no list read at start');
  assert.match(gladys.fake.connectionStatus.message.en, /Lists not watched/);
  const content = (await gladys.fake.widgetGet(WIDGETS.LIST, { settings: {} })).data.content;
  assert.equal(content.components[0].text, 'Courses', 'read on demand');
  state.items[COURSES].items.purchase.push({ itemId: 'Bier', specification: '' });
  const read = await gladys.fake.sceneAction(SCENE_ACTIONS.READ, {});
  assert.equal(read.data.outputs.count, 3, 'the reading of the widget is still fresh');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'no trigger without watching');
});

test('a configuration update that only saved the session does not restart', async () => {
  const { app, gladys, timers } = await setup();
  await app.start(CONFIG);
  const calls = bring.calls.length;
  await gladys.fake.configUpdated({ ...CONFIG, [SESSION_KEY]: JSON.stringify(SESSION) });
  assert.equal(bring.calls.length, calls);
  await gladys.fake.configUpdated({ ...CONFIG, poll_minutes: 5 });
  assert.ok(bring.calls.length > calls, 'a real change restarts');
  assert.equal(timers.intervals()[0].ms, 300_000);
  assert.equal(timers.intervals().length, 1);
});

test('the test button shows the lists', async () => {
  const { app, gladys } = await setup();
  await app.start(CONFIG);
  const result = await gladys.fake.action(ACTIONS.TEST);
  assert.match(result.data.message.en, /- Courses: 3 items to buy \(articles in fr-FR\)/);
  assert.match(result.data.message.fr, /- Weekend : 1 article à acheter \(articles en en-US\)/);
});

test('neither the password nor the tokens reach the logs, the status or the scenes', async () => {
  const state = bringState();
  state.items[WEEKEND] = undefined; // a list that fails to read
  const { app, gladys, logs } = await setup({ state });
  await app.start(CONFIG);
  await gladys.fake.sceneAction(SCENE_ACTIONS.ADD, { list: 'Weekend', item: 'x' });
  state.login = () => json(fixture('login-401.json'), 401);
  await app.start({ ...CONFIG, password: 'other' });
  const seen = JSON.stringify([logs, gladys.fake.connectionStatuses, gladys.fake.sceneEvents]);
  assert.ok(logs.length > 0);
  for (const secret of [PASSWORD, 'access-token-1', 'refresh-token-1', USER]) {
    assert.ok(!seen.includes(secret), `${secret} leaked`);
  }
});
