// -----------------------------------------------------------------------------
// Constants of the Bring! integration. Everything Bring!-specific (endpoints,
// headers, field names) lives in src/bring/: only the pacing, the limits and
// the manifest keys are here.
// -----------------------------------------------------------------------------

/** Identifies the integration on every request (the API is unofficial). */
export const USER_AGENT = 'gladys-bring/0.1 (+https://github.com/LM1LC3N7/gladys-bring)';
export const HTTP_TIMEOUT = 15_000;

/** The names of the lists and their article language change rarely: once an hour. */
export const DIRECTORY_INTERVAL = 60 * 60_000;
/** The article translations (one file per language) are kept a day. */
export const CATALOG_TTL = 24 * 60 * 60_000;
/** A translation file that failed is tried again after this delay. */
export const CATALOG_RETRY = 60 * 60_000;
/** A widget or a scene action reuses a reading younger than this. */
export const READING_MAX_AGE = 30_000;
/** The access token is renewed this long before it expires. */
export const TOKEN_MARGIN = 5 * 60_000;

/** Longest string a scene event carries (the core caps them at 1000). */
export const MAX_EVENT_TEXT = 1000;
/** Rows of the widget status list (the vocabulary allows 10). */
export const WIDGET_ROWS = 10;

/**
 * Off-schema configuration key holding the Bring! session (user uuid and
 * refresh token, as JSON). Never shown in the UI; excluded from the config
 * fingerprint so a token rotation does not restart the integration.
 */
export const SESSION_KEY = 'bring_session';

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection' };
export const SCENE_ACTIONS = {
  ADD: 'add_item',
  COMPLETE: 'complete_item',
  REMOVE: 'remove_item',
  READ: 'get_list',
};
export const SCENE_TRIGGERS = {
  ADDED: 'item_added',
  CHECKED_OFF: 'item_checked_off',
  EMPTIED: 'list_emptied',
};
export const WIDGETS = { LIST: 'shopping_list' };
/** The keys of the widget buttons (stored nowhere, but kept stable anyway). */
export const WIDGET_ACTIONS = { ADD: 'add', CHECK_OFF: 'check_off', QUICK_ADD: 'quick_add' };
