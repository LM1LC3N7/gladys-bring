// -----------------------------------------------------------------------------
// Readings of a list (see readingOf in src/bring/model.js), looked up and
// changed. Pure.
//
// A reading: { listUuid, listName, locale, readAt, purchase, recently }, each
// item { key, name, spec, uuid } where `key` is what Bring! stores (a catalog
// key such as "Milch", or a free text) and `name` what the user sees ("Lait").
// Items are told apart by their key: Bring! keeps one entry per key and a
// second "add" only updates its specification.
// -----------------------------------------------------------------------------

import { OPERATIONS, fold } from './bring/model.js';

/**
 * The list a scene or a widget names: by name (any case, any accent) or uuid;
 * an empty query is the user's default list, else the first one.
 */
export function findList(lists, query, defaultUuid = null) {
  const wanted = fold(query);
  if (!wanted) {
    return lists.find((l) => l.uuid === defaultUuid) ?? lists[0];
  }
  return (
    lists.find((l) => l.uuid === String(query).trim()) ??
    lists.find((l) => fold(l.name) === wanted) ??
    lists.find((l) => fold(l.name).includes(wanted))
  );
}

/** The item of `items` the user means: same key once translated, or same shown name. */
export function findItem(items, query, catalog) {
  const key = catalog.toKey(query);
  const wanted = fold(query);
  return (
    items.find((i) => i.key === key) ??
    items.find((i) => fold(i.name) === wanted || fold(i.key) === wanted)
  );
}

/** "Lait (2 l)". */
export function itemLabel(item) {
  return item.spec ? `${item.name} (${item.spec})` : item.name;
}

/** "Lait (2 l), Pain, Ampoules" — the scene action output. */
export function itemsText(reading) {
  return reading.purchase.map(itemLabel).join(', ');
}

/**
 * The reading as it should be once a change made through Gladys is applied:
 * the next reading is compared with it, so the integration's own changes fire
 * no scene event (a scene bound to "item added" that adds an item cannot loop
 * through the integration), while concurrent changes made in the app still do.
 */
export function applyChange(reading, { key, name = key, spec = '', operation }) {
  if (!reading) {
    return reading;
  }
  const others = (list) => list.filter((i) => i.key !== key);
  const current = reading.purchase.find((i) => i.key === key);
  const item = { key, name: current?.name ?? name, spec, uuid: current?.uuid ?? null };
  if (operation === OPERATIONS.ADD) {
    return {
      ...reading,
      purchase: [...others(reading.purchase), item],
      recently: others(reading.recently),
    };
  }
  if (operation === OPERATIONS.COMPLETE) {
    return {
      ...reading,
      purchase: others(reading.purchase),
      recently: [item, ...others(reading.recently)],
    };
  }
  return { ...reading, purchase: others(reading.purchase), recently: others(reading.recently) };
}
