// -----------------------------------------------------------------------------
// Two consecutive readings of a list -> scene events. Pure. Nothing fires on
// the first reading (no transition without a previous value), and an item
// fires once: the comparison is by item key, so a specification edited in
// the app ("1 l" -> "2 l") is not a new item.
// -----------------------------------------------------------------------------

import { MAX_EVENT_TEXT, SCENE_TRIGGERS } from './constants.js';

const bounded = (text) => String(text ?? '').slice(0, MAX_EVENT_TEXT);

/** The events of one list between two readings. */
export function listEvents(previous, current) {
  if (!previous || !current) {
    return [];
  }
  const events = [];
  const before = new Set(previous.purchase.map((i) => i.key));
  const now = new Set(current.purchase.map((i) => i.key));
  const recent = new Set(current.recently.map((i) => i.key));
  const data = (item) => ({
    list: bounded(current.listName),
    item: bounded(item.name),
    specification: bounded(item.spec),
    count: current.purchase.length,
  });
  for (const item of current.purchase) {
    if (!before.has(item.key)) {
      events.push({ key: SCENE_TRIGGERS.ADDED, data: data(item) });
    }
  }
  for (const item of previous.purchase) {
    // Gone from the list AND among the recent items: checked off. Gone from
    // both: removed (no trigger).
    if (!now.has(item.key) && recent.has(item.key)) {
      events.push({ key: SCENE_TRIGGERS.CHECKED_OFF, data: data(item) });
    }
  }
  if (previous.purchase.length > 0 && current.purchase.length === 0) {
    events.push({
      key: SCENE_TRIGGERS.EMPTIED,
      data: { list: bounded(current.listName), previous_count: previous.purchase.length },
    });
  }
  return events;
}
