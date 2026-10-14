// -----------------------------------------------------------------------------
// The dashboard widget "Bring! shopping list". Pure.
//
// The vocabulary allows at most 4 buttons per card, so an item cannot carry
// its own check-off button: one "Check off" button opens a form listing the
// items to buy (a `select`), next to an "Add" form and an optional one-tap
// item set in the widget settings. Forms behind a button need Gladys 5.2; the
// one-tap item works on 5.1.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_ACTIONS, WIDGET_ROWS } from './constants.js';
import { T } from './i18n.js';
import { itemLabel } from './lists.js';

const cut = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
const same = (text) => ({ en: text, fr: text });
/** A plain or multi-language text, cut to `max` characters per language. */
const bound = (text, max) =>
  typeof text === 'string'
    ? cut(text, max)
    : Object.fromEntries(Object.entries(text).map(([lang, value]) => [lang, cut(value, max)]));

/** A body-only content: the empty or degraded states. */
export function messageWidget(text, { heading = 'Bring!', ttl = 300 } = {}) {
  return {
    ttl_seconds: ttl,
    components: [
      { type: 'text', text: cut(heading, 40), variant: 'heading' },
      { type: 'text', text: bound(text, 300), variant: 'body' },
    ],
  };
}

function addButton() {
  return {
    type: 'button',
    label: T.widget.add,
    icon: 'plus',
    style: 'primary',
    action: {
      key: WIDGET_ACTIONS.ADD,
      fields: [
        {
          key: 'item',
          type: 'string',
          required: true,
          label: T.widget.item,
          placeholder: T.widget.itemPlaceholder,
        },
        {
          key: 'specification',
          type: 'string',
          required: false,
          label: T.widget.specification,
          placeholder: T.widget.specificationPlaceholder,
        },
      ],
    },
  };
}

function checkOffButton(items) {
  return {
    type: 'button',
    label: T.widget.checkOff,
    icon: 'check',
    action: {
      key: WIDGET_ACTIONS.CHECK_OFF,
      fields: [
        {
          key: 'item',
          type: 'select',
          required: true,
          label: T.widget.item,
          default: items[0].key,
          options: items.map((i) => ({ value: i.key, label: same(cut(itemLabel(i), 40)) })),
        },
      ],
    },
  };
}

function quickButton(quickItem) {
  return {
    type: 'button',
    label: same(cut(`+ ${quickItem}`, 24)),
    icon: 'plus-circle',
    action: { key: WIDGET_ACTIONS.QUICK_ADD },
  };
}

/**
 * The content of one list: its name, the items to buy (10 rows at most, the
 * last one counting the rest), the add / check off / one-tap buttons.
 */
export function listWidget({ reading, quickItem = '', ttl = 120 }) {
  const components = [{ type: 'text', text: cut(reading.listName, 40), variant: 'heading' }];
  const items = reading.purchase;
  if (items.length === 0) {
    components.push({ type: 'text', text: T.widget.empty, variant: 'body' });
  } else {
    components.push({ type: 'text', text: T.widget.toBuy(items.length), variant: 'caption' });
    const shown = items.length > WIDGET_ROWS ? items.slice(0, WIDGET_ROWS - 1) : items;
    const rows = shown.map((i) => ({
      label: cut(i.name, 40),
      value: cut(i.spec, 40) || '—',
      icon: 'shopping-cart',
      color: WIDGET_COLORS.PRIMARY,
    }));
    if (items.length > shown.length) {
      rows.push({
        label: T.widget.more(items.length - shown.length),
        value: '…',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    components.push({ type: 'status', items: rows });
  }
  components.push(addButton());
  if (items.length > 0) {
    components.push(checkOffButton(items));
  }
  if (String(quickItem).trim()) {
    components.push(quickButton(String(quickItem).trim()));
  }
  return { ttl_seconds: Math.max(60, Math.min(3600, ttl)), components };
}
