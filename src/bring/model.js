// -----------------------------------------------------------------------------
// Bring! JSON -> plain objects, and the article catalog. Pure.
//
// Built blind (no account to test with): the field names come from the
// `bring-api` library used by the Home Assistant integration (v1.1.2) and the
// older `python-bring-api` (v3.0.0). Every Bring!-specific name is in this
// file or in ./api.js, so a user report fixes one place.
//
// Item names are catalog keys in Swiss German ("Milch"); the app shows them
// translated with the per-language files of web.getbring.com. A name that is
// not in the catalog is free text, shown and sent as is.
// -----------------------------------------------------------------------------

/** Bring! operations of an item change. */
export const OPERATIONS = { ADD: 'TO_PURCHASE', COMPLETE: 'TO_RECENTLY', REMOVE: 'REMOVE' };

/** The language of the catalog keys: no translation file needed. */
export const KEY_LOCALE = 'de-CH';

/** The locales the web app publishes an `articles.<locale>.json` for. */
export const LOCALES = [
  'de-AT',
  'de-CH',
  'de-DE',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-US',
  'es-ES',
  'fr-CH',
  'fr-FR',
  'hu-HU',
  'it-CH',
  'it-IT',
  'nb-NO',
  'nl-NL',
  'pl-PL',
  'pt-BR',
  'ru-RU',
  'sv-SE',
  'tr-TR',
];

/** The most common locale of a language, when language + country is not one. */
const LANGUAGE_LOCALES = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  hu: 'hu-HU',
  it: 'it-IT',
  nb: 'nb-NO',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-BR',
  ru: 'ru-RU',
  sv: 'sv-SE',
  tr: 'tr-TR',
};

/** Lowercase, no accents, single spaces: "  Œufs  frais" and "oeufs frais" meet. */
export function fold(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Authentication -------------------------------------------------------------

/** POST v2/bringauth -> the session and the tokens. */
export function authOf(raw = {}) {
  return {
    uuid: raw.uuid,
    publicUuid: raw.publicUuid ?? null,
    listUuid: raw.bringListUUID ?? null,
    accessToken: raw.access_token,
    tokenType: raw.token_type || 'Bearer',
    refreshToken: raw.refresh_token ?? null,
    expiresIn: Number(raw.expires_in) || 3600,
  };
}

// --- Lists and items ---------------------------------------------------------------

/** GET bringusers/{uuid}/lists -> [{ uuid, name, theme }]. */
export function listsOf(raw) {
  return (raw?.lists ?? [])
    .filter((l) => l && typeof l.listUuid === 'string')
    .map((l) => ({
      uuid: l.listUuid,
      name: String(l.name ?? '').trim() || l.listUuid,
      theme: l.theme ?? null,
    }));
}

/** One item: the newer shape { uuid, itemId, specification } or the older { name, specification }. */
export function itemOf(raw) {
  const key = String(raw?.itemId ?? raw?.name ?? '').trim();
  if (!key) {
    return undefined;
  }
  return {
    key,
    spec: String(raw.specification ?? '').trim(),
    uuid: typeof raw.uuid === 'string' && raw.uuid ? raw.uuid : null,
  };
}

/**
 * GET v2/bringlists/{listUuid} -> { purchase, recently }. Newer answers nest
 * the two arrays under `items`, older ones have them at the top level.
 */
export function itemsOf(raw) {
  const source = raw?.items && typeof raw.items === 'object' ? raw.items : raw;
  const pick = (list) => (Array.isArray(list) ? list.map(itemOf).filter(Boolean) : []);
  return { purchase: pick(source?.purchase), recently: pick(source?.recently) };
}

/** The reading of a list: its items to buy and recently bought, with display names. */
export function readingOf(raw, { list, catalog, now }) {
  const { purchase, recently } = itemsOf(raw);
  const named = (item) => ({ ...item, name: catalog.toName(item.key) });
  return {
    listUuid: list.uuid,
    listName: list.name,
    locale: catalog.locale,
    readAt: new Date(now).toISOString(),
    purchase: purchase.map(named),
    recently: recently.map(named),
  };
}

/** One change of PUT v2/bringlists/{listUuid}/items. */
export function changeOf({ key, spec = '', uuid = null, operation }) {
  return {
    // The library sends a neutral location with every change.
    accuracy: '0.0',
    altitude: '0.0',
    latitude: '0.0',
    longitude: '0.0',
    itemId: key,
    spec,
    uuid,
    operation,
  };
}

// --- Languages ------------------------------------------------------------------------

/** GET bringusersettings/{uuid} -> Map listUuid -> article locale ("fr-FR"). */
export function listLocalesOf(raw) {
  const locales = new Map();
  for (const entry of raw?.userlistsettings ?? []) {
    const setting = (entry?.usersettings ?? []).find((s) => s?.key === 'listArticleLanguage');
    if (entry?.listUuid && LOCALES.includes(setting?.value)) {
      locales.set(entry.listUuid, setting.value);
    }
  }
  return locales;
}

/** GET v2/bringusers/{uuid} -> { locale, country } of the account. */
export function accountLocaleOf(raw) {
  const language = String(raw?.userLocale?.language ?? '').toLowerCase();
  const country = String(raw?.userLocale?.country ?? '').toUpperCase();
  const exact = `${language}-${country}`;
  return {
    locale: LOCALES.includes(exact) ? exact : (LANGUAGE_LOCALES[language] ?? KEY_LOCALE),
    country: /^[A-Z]{2}$/.test(country) ? country : null,
  };
}

/**
 * The catalog of one locale, from its `articles.<locale>.json` (catalog key
 * -> translated name). Without a dictionary it is the identity.
 */
export function catalogOf(locale, dictionary = {}) {
  const entries = Object.entries(dictionary ?? {}).filter(
    ([key, name]) => typeof key === 'string' && typeof name === 'string' && key && name,
  );
  const names = new Map(entries);
  const byName = new Map();
  const byKey = new Map();
  for (const [key, name] of entries) {
    const folded = fold(name);
    // Two keys can share a translation ("Champignons", "Pilze"): the key
    // that is its own translation wins, otherwise the first one.
    if (!byName.has(folded) || fold(key) === folded) {
      byName.set(folded, key);
    }
    byKey.set(fold(key), key);
  }
  return {
    locale,
    size: names.size,
    /** "Milch" -> "Lait"; a free text stays as is. */
    toName: (key) => names.get(key) ?? key,
    /** "lait" -> "Milch" (the name in this language first, then the key); a free text stays as is. */
    toKey(text) {
      const trimmed = String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      const folded = fold(trimmed);
      return byName.get(folded) ?? byKey.get(folded) ?? trimmed;
    },
  };
}
