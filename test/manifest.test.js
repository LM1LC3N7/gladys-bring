// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listEvents } from '../src/triggers.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS, SESSION_KEY, WIDGETS } from '../src/constants.js';
import { DEFAULTS } from '../src/config.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const index = read('index.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'provider');
  assert.match(manifest.gladys_version, />=5\.1\.0/, 'widgets and scenes need Gladys 5.1');
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-bring:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
  const intro = manifest.config_schema.find((f) => f.type === 'section');
  assert.match(intro.description.en, /not affiliated with Bring! Labs/);
  assert.match(intro.description.fr, /sans lien avec Bring! Labs/);
  assert.match(intro.description.en, /password is sent only to Bring!/);
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
  }
  assert.equal(fields.email.type, 'string');
  assert.equal(fields.password.type, 'secret');
  assert.equal(fields.poll_minutes.min, 1, 'never faster than once a minute');
  assert.equal(fields[SESSION_KEY], undefined, 'the session stays off-schema');
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(
    manifest.actions.map((a) => a.key),
    Object.values(ACTIONS),
  );
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    Object.values(WIDGETS),
  );
  for (const name of Object.keys(SCENE_ACTIONS)) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`), name);
  }
  assert.ok(index.includes('onWidgetGet(WIDGETS.LIST'));
  assert.ok(index.includes('onWidgetAction(WIDGETS.LIST'));
  assert.ok(index.includes('onAction(ACTIONS.TEST'));
  // Every trigger filter is a key of the event data, every variable too.
  const item = { key: 'Milch', name: 'Lait', spec: '', uuid: null };
  const empty = { listName: 'L', purchase: [], recently: [] };
  const events = [
    ...listEvents(empty, { ...empty, purchase: [item] }),
    ...listEvents({ ...empty, purchase: [item] }, { ...empty, recently: [item] }),
  ];
  for (const trigger of manifest.scene_triggers) {
    const event = events.find((e) => e.key === trigger.key);
    assert.ok(event, `${trigger.key} is fired by the code`);
    for (const key of [...trigger.fields, ...trigger.variables].map((f) => f.key)) {
      assert.ok(key in event.data, `${trigger.key}.${key}`);
    }
  }
});
