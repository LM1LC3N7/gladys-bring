// -----------------------------------------------------------------------------
// The pure parts: Bring! JSON -> readings, the catalog, the lists, the
// triggers, the configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONS,
  accountLocaleOf,
  authOf,
  catalogOf,
  changeOf,
  fold,
  itemsOf,
  listLocalesOf,
  listsOf,
  readingOf,
} from '../src/bring/model.js';
import { configFingerprint, normalizeConfig, parseSession } from '../src/config.js';
import { SCENE_TRIGGERS, SESSION_KEY } from '../src/constants.js';
import { applyChange, findItem, findList, itemsText } from '../src/lists.js';
import { listEvents } from '../src/triggers.js';
import { COURSES, WEEKEND, fixture } from './helpers/fakeBring.js';

const fr = catalogOf('fr-FR', fixture('articles.fr-FR.json'));
const courses = { uuid: COURSES, name: 'Courses' };
const reading = (raw = fixture('items-courses.json')) =>
  readingOf(raw, { list: courses, catalog: fr, now: Date.parse('2026-10-14T08:00:00Z') });

test('the sign-in answer, the lists and the list languages', () => {
  const auth = authOf(fixture('auth.json'));
  assert.equal(auth.uuid, '9a4e2f10-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
  assert.equal(auth.listUuid, COURSES);
  assert.equal(auth.tokenType, 'Bearer');
  assert.equal(auth.expiresIn, 604799);
  assert.deepEqual(
    listsOf(fixture('lists.json')).map((l) => l.name),
    ['Courses', 'Weekend'],
  );
  assert.deepEqual(listsOf({}), []);
  const locales = listLocalesOf(fixture('usersettings.json'));
  assert.equal(locales.get(COURSES), 'fr-FR');
  assert.equal(locales.get(WEEKEND), 'en-US');
  assert.deepEqual(accountLocaleOf(fixture('account.json')), { locale: 'fr-FR', country: 'FR' });
  assert.deepEqual(accountLocaleOf({ userLocale: { language: 'fr', country: 'BE' } }), {
    locale: 'fr-FR',
    country: 'BE',
  });
  assert.deepEqual(accountLocaleOf({}), { locale: 'de-CH', country: null });
});

test('both shapes of a list become the same items', () => {
  const newer = itemsOf(fixture('items-courses.json'));
  assert.deepEqual(newer.purchase[0], {
    key: 'Milch',
    spec: '2 l',
    uuid: 'a0000001-0000-4000-8000-000000000001',
  });
  assert.equal(newer.purchase.length, 3);
  assert.equal(newer.recently.length, 2);
  const older = itemsOf(fixture('items-legacy.json'));
  assert.deepEqual(older.purchase[0], { key: 'Milch', spec: '2 l', uuid: null });
  assert.deepEqual(
    older.recently.map((i) => i.key),
    ['Eier'],
  );
  assert.deepEqual(itemsOf(undefined), { purchase: [], recently: [] });
});

test('the catalog translates both ways, free text stays as is', () => {
  assert.equal(fold('  Œufs  Frais '), 'oeufs frais');
  assert.equal(fr.toName('Milch'), 'Lait');
  assert.equal(fr.toName('Ampoules LED'), 'Ampoules LED');
  assert.equal(fr.toKey('lait'), 'Milch');
  assert.equal(fr.toKey('  CAFE '), 'Kaffee', 'case and accents do not matter');
  assert.equal(fr.toKey('Milch'), 'Milch', 'the catalog key itself');
  assert.equal(fr.toKey('Champignons'), 'Champignons', 'a shared name goes to its own key');
  assert.equal(fr.toKey('Ampoules  LED'), 'Ampoules LED');
  const none = catalogOf('xx-XX');
  assert.equal(none.toName('Milch'), 'Milch');
  assert.equal(none.toKey('lait'), 'lait');
});

test('a reading carries the shown names; the change body is the library one', () => {
  const r = reading();
  assert.equal(r.listName, 'Courses');
  assert.equal(r.locale, 'fr-FR');
  assert.deepEqual(
    r.purchase.map((i) => i.name),
    ['Lait', 'Pain', 'Ampoules LED'],
  );
  assert.equal(itemsText(r), 'Lait (2 l), Pain, Ampoules LED (E27)');
  assert.deepEqual(changeOf({ key: 'Milch', spec: '2 l', operation: OPERATIONS.ADD }), {
    accuracy: '0.0',
    altitude: '0.0',
    latitude: '0.0',
    longitude: '0.0',
    itemId: 'Milch',
    spec: '2 l',
    uuid: null,
    operation: 'TO_PURCHASE',
  });
});

test('lists are found by name, uuid or default; items by shown name or key', () => {
  const lists = listsOf(fixture('lists.json'));
  assert.equal(findList(lists, 'courses').uuid, COURSES);
  assert.equal(findList(lists, WEEKEND).name, 'Weekend');
  assert.equal(findList(lists, 'week').name, 'Weekend', 'a part of the name');
  assert.equal(findList(lists, '', WEEKEND).name, 'Weekend', 'the default list');
  assert.equal(findList(lists, '').name, 'Courses', 'else the first one');
  assert.equal(findList(lists, 'Bricolage'), undefined);
  const items = reading().purchase;
  assert.equal(findItem(items, 'LAIT', fr).key, 'Milch');
  assert.equal(findItem(items, 'Milch', fr).key, 'Milch');
  assert.equal(findItem(items, 'ampoules led', fr).key, 'Ampoules LED');
  assert.equal(findItem(items, 'Oeufs', fr), undefined, 'recently bought is not to buy');
});

test('the first reading fires nothing; then one event per transition', () => {
  const first = reading();
  assert.deepEqual(listEvents(undefined, first), []);
  assert.deepEqual(listEvents(first, first), []);
  const raw = fixture('items-courses.json');
  // In the app: "Oeufs" added back, "Lait" checked off, the LED bulbs removed,
  // the spec of "Pain" edited.
  const [milk, bread] = raw.items.purchase;
  bread.specification = 'complet';
  raw.items.purchase = [bread, { uuid: 'x', itemId: 'Eier', specification: '12' }];
  raw.items.recently = [milk, raw.items.recently[1]];
  const second = reading(raw);
  const events = listEvents(first, second);
  assert.deepEqual(events, [
    {
      key: SCENE_TRIGGERS.ADDED,
      data: { list: 'Courses', item: 'Oeufs', specification: '12', count: 2 },
    },
    {
      key: SCENE_TRIGGERS.CHECKED_OFF,
      data: { list: 'Courses', item: 'Lait', specification: '2 l', count: 2 },
    },
  ]);
  assert.deepEqual(listEvents(second, second), [], 'nothing twice');
});

test('the list emptied fires once', () => {
  const first = reading();
  const raw = fixture('items-courses.json');
  raw.items.recently.unshift(...raw.items.purchase);
  raw.items.purchase = [];
  const done = reading(raw);
  const events = listEvents(first, done);
  assert.equal(events.filter((e) => e.key === SCENE_TRIGGERS.CHECKED_OFF).length, 3);
  assert.deepEqual(events.at(-1), {
    key: SCENE_TRIGGERS.EMPTIED,
    data: { list: 'Courses', previous_count: 3 },
  });
  assert.deepEqual(listEvents(done, done), []);
});

test('a change made through Gladys fires nothing, a concurrent one still does', () => {
  const before = reading();
  const raw = fixture('items-courses.json');
  raw.items.purchase.push(
    { itemId: 'Zucker', specification: '' },
    { itemId: 'Bier', specification: '' },
  );
  const after = reading(raw);
  const expected = applyChange(before, { key: 'Zucker', name: 'Sucre', operation: OPERATIONS.ADD });
  assert.deepEqual(
    listEvents(expected, after).map((e) => e.data.item),
    ['Bière'],
  );
  const checked = applyChange(before, { key: 'Milch', operation: OPERATIONS.COMPLETE });
  assert.deepEqual(
    checked.purchase.map((i) => i.key),
    ['Brot', 'Ampoules LED'],
  );
  assert.equal(checked.recently[0].name, 'Lait');
  const removed = applyChange(before, { key: 'Eier', operation: OPERATIONS.REMOVE });
  assert.deepEqual(
    removed.recently.map((i) => i.key),
    ['Kaffee'],
  );
  assert.equal(applyChange(undefined, { key: 'x' }), undefined);
});

test('the configuration and its fingerprint', () => {
  const config = normalizeConfig({ email: ' a@b.c ', password: ' p w ', poll_minutes: '0' });
  assert.equal(config.email, 'a@b.c');
  assert.equal(config.password, ' p w ', 'a password is never trimmed');
  assert.equal(config.pollMinutes, 1);
  assert.equal(config.watchLists, true);
  assert.equal(normalizeConfig({ poll_minutes: '' }).pollMinutes, 2);
  assert.equal(normalizeConfig({ watch_lists: false }).watchLists, false);
  const session = { email: 'a@b.c', uuid: 'u', refreshToken: 'r' };
  assert.deepEqual(normalizeConfig({ [SESSION_KEY]: JSON.stringify(session) }).session, session);
  assert.equal(parseSession('{oops'), undefined);
  assert.equal(parseSession(JSON.stringify({ uuid: 'u' })), undefined);
  assert.equal(
    configFingerprint({ email: 'a', [SESSION_KEY]: 'x' }),
    configFingerprint({ email: 'a', [SESSION_KEY]: 'y' }),
  );
  assert.notEqual(configFingerprint({ email: 'a' }), configFingerprint({ email: 'b' }));
});
