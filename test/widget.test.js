// -----------------------------------------------------------------------------
// The widget content, checked against the SDK's own validator: [] means the
// core renders it exactly as sent.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { catalogOf, readingOf } from '../src/bring/model.js';
import { WIDGET_ACTIONS } from '../src/constants.js';
import { listWidget, messageWidget } from '../src/widget.js';
import { COURSES, fixture } from './helpers/fakeBring.js';

const fr = catalogOf('fr-FR', fixture('articles.fr-FR.json'));
const reading = (raw = fixture('items-courses.json')) =>
  readingOf(raw, {
    list: { uuid: COURSES, name: 'Courses' },
    catalog: fr,
    now: Date.parse('2026-10-14T08:00:00Z'),
  });

test('the items to buy, an add form, a check-off form and the one-tap item', () => {
  const content = listWidget({ reading: reading(), quickItem: 'Lait', ttl: 120 });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, 120);
  assert.equal(content.components[0].text, 'Courses');
  assert.equal(content.components[1].text.fr, '3 articles à acheter');
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.value]),
    [
      ['Lait', '2 l'],
      ['Pain', '—'],
      ['Ampoules LED', 'E27'],
    ],
  );
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => b.action.key),
    [WIDGET_ACTIONS.ADD, WIDGET_ACTIONS.CHECK_OFF, WIDGET_ACTIONS.QUICK_ADD],
  );
  const select = buttons[1].action.fields[0];
  assert.deepEqual(
    select.options.map((o) => [o.value, o.label.fr]),
    [
      ['Milch', 'Lait (2 l)'],
      ['Brot', 'Pain'],
      ['Ampoules LED', 'Ampoules LED (E27)'],
    ],
  );
  assert.equal(select.default, 'Milch');
  assert.equal(buttons[2].label.en, '+ Lait');
});

test('an empty list, a long list, the messages', () => {
  const raw = fixture('items-courses.json');
  raw.items.purchase = [];
  const empty = listWidget({ reading: reading(raw) });
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.equal(empty.components[1].text.en, 'Nothing to buy');
  assert.deepEqual(
    empty.components.filter((c) => c.type === 'button').map((b) => b.action.key),
    [WIDGET_ACTIONS.ADD],
    'nothing to check off',
  );
  const long = fixture('items-courses.json');
  long.items.purchase = Array.from({ length: 14 }, (_, i) => ({
    itemId: `Article ${i + 1} au nom vraiment très long pour la carte`,
    specification: '',
  }));
  const content = listWidget({ reading: reading(long), ttl: 99_999 });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, 3600);
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.equal(rows.length, 10);
  assert.equal(rows[9].label.fr, '+ 5 de plus');
  assert.ok(rows[0].label.length <= 40);
  const message = messageWidget({ en: 'x'.repeat(400), fr: 'y' });
  assert.deepEqual(validateWidgetContent(message), []);
  assert.equal(message.components[1].text.en.length, 300);
});
