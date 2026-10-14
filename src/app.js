// -----------------------------------------------------------------------------
// The integration itself: the Bring! session, the lists and their readings,
// the scene triggers, the scene actions, the widget and the test button.
// index.js only wires the SDK handlers to it.
//
// Pace: every list is read every `poll_minutes` (2 by default) while the
// lists are watched, and right after a change made through Gladys; the names
// of the lists and their article language once an hour; the translation
// files once a day. Without watching, nothing runs in the background: the
// widget and the scene actions read a list when they need it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { BringClient, BringError } from './bring/api.js';
import {
  KEY_LOCALE,
  LOCALES,
  OPERATIONS,
  accountLocaleOf,
  catalogOf,
  changeOf,
  listLocalesOf,
  listsOf,
  readingOf,
} from './bring/model.js';
import { configFingerprint, normalizeConfig } from './config.js';
import {
  CATALOG_RETRY,
  CATALOG_TTL,
  DIRECTORY_INTERVAL,
  READING_MAX_AGE,
  SESSION_KEY,
  WIDGETS,
  WIDGET_ACTIONS,
} from './constants.js';
import { T } from './i18n.js';
import { applyChange, findItem, findList, itemsText } from './lists.js';
import { listEvents } from './triggers.js';
import { listWidget, messageWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

/** What the widget shows of a reading: a change of it deserves a nudge. */
const signature = (reading) =>
  reading ? JSON.stringify(reading.purchase.map((i) => [i.key, i.spec])) : '';

const toast = (text) =>
  Object.fromEntries(Object.entries(text).map(([lang, value]) => [lang, value.slice(0, 200)]));

export class BringApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'bring' }),
    now = Date.now,
    timers = defaultTimers,
    clientFactory = (options) => new BringClient(options),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.clientFactory = clientFactory;
    this.config = normalizeConfig();
    this.client = undefined;
    this.fingerprint = undefined;
    /** [{ uuid, name, theme }] and when they were read. */
    this.lists = [];
    this.directoryAt = 0;
    /** listUuid -> article locale, and the account's locale for the others. */
    this.listLocales = new Map();
    this.accountLocale = KEY_LOCALE;
    this.accountRead = false;
    /** locale -> { catalog, until } (kept across restarts: the files are public). */
    this.catalogs = new Map();
    /** listUuid -> the last reading. */
    this.readings = new Map();
    this.refreshTimer = undefined;
    this.refreshing = undefined;
    this.lastStatus = undefined;
    this.generation = 0;
    this.lock = Promise.resolve();
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = this.generation;
    this.fingerprint = configFingerprint(raw);
    this.config = normalizeConfig(raw);
    this.lists = [];
    this.directoryAt = 0;
    this.listLocales = new Map();
    this.accountRead = false;
    this.readings.clear();
    if (!this.config.email || !this.config.password) {
      this.client = undefined;
      await this.setStatus(false, T.notConfigured);
      return;
    }
    this.client = this.clientFactory({
      email: this.config.email,
      password: this.config.password,
      session: this.config.session,
      onSession: (session) => this.persistSession(session),
      now: this.now,
    });
    try {
      await this.exclusive(async () => {
        if (this.config.watchLists) {
          await this.refreshAll();
        } else {
          await this.loadDirectory();
          await this.reportOk();
        }
      });
    } catch (err) {
      await this.reportError(err);
      if (err instanceof BringError && err.final) {
        return;
      }
    }
    if (generation !== this.generation || !this.config.watchLists) {
      return;
    }
    this.refreshTimer = this.timers.setInterval(
      () => this.refresh().catch((err) => this.reportError(err)),
      this.config.pollMinutes * 60_000,
    );
  }

  /** A configuration update: when only the stored session changed (our own save), nothing restarts. */
  async configUpdated(raw = {}) {
    if (configFingerprint(raw) === this.fingerprint) {
      return;
    }
    this.logger.info('Configuration updated: restarting');
    await this.start(raw);
  }

  stop() {
    this.generation += 1;
    this.timers.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  /** Bring! calls never overlap: a scene action waits for the reading in progress. */
  exclusive(fn) {
    const run = this.lock.then(fn);
    this.lock = run.catch(() => {});
    return run;
  }

  async persistSession(session) {
    await this.gladys
      .setConfig({ [SESSION_KEY]: JSON.stringify(session) })
      .catch((err) => this.logger.warn(`Saving the Bring! session failed: ${err.message}`));
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async reportOk() {
    if (this.lists.length === 0) {
      await this.setStatus(true, T.noList);
    } else {
      await this.setStatus(
        true,
        T.ok(
          this.lists.map((l) => l.name),
          this.config.watchLists,
        ),
      );
    }
  }

  async reportError(err) {
    if (err instanceof BringError && err.final) {
      // A refused password is not retried: the user fixes the configuration.
      this.logger.warn(`Bring! refused the account (${err.code})`);
      this.timers.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      await this.setStatus(false, err.code === 'bad_email' ? T.badEmail : T.badCredentials);
      return;
    }
    this.logger.warn(`Bring! unreachable: ${err.message}`);
    await this.setStatus(false, T.unreachable(err.message));
  }

  requireClient() {
    if (!this.client) {
      throw new Error(T.notConfigured.en);
    }
    return this.client;
  }

  // --- Lists, languages, translations -------------------------------------------

  async loadDirectory({ force = false } = {}) {
    if (!force && this.lists.length > 0 && this.now() - this.directoryAt < DIRECTORY_INTERVAL) {
      return;
    }
    const client = this.requireClient();
    this.lists = listsOf(await client.lists());
    if (!this.accountRead) {
      try {
        const { locale, country } = accountLocaleOf(await client.account());
        this.accountLocale = locale;
        if (country) {
          client.country = country;
        }
        this.accountRead = true;
      } catch (err) {
        this.logger.warn(`Reading the Bring! account language failed: ${err.message}`);
      }
    }
    try {
      this.listLocales = listLocalesOf(await client.userSettings());
    } catch (err) {
      this.logger.warn(`Reading the Bring! list languages failed: ${err.message}`);
    }
    this.directoryAt = this.now();
    for (const uuid of this.readings.keys()) {
      if (!this.lists.some((l) => l.uuid === uuid)) {
        this.readings.delete(uuid);
      }
    }
  }

  localeOf(list) {
    return this.listLocales.get(list.uuid) ?? this.accountLocale;
  }

  /** The catalog of a locale; without its file the names stay as Bring! stores them. */
  async catalog(locale) {
    const cached = this.catalogs.get(locale);
    if (cached && this.now() < cached.until) {
      return cached.catalog;
    }
    let catalog = catalogOf(locale);
    let ttl = CATALOG_TTL;
    if (LOCALES.includes(locale)) {
      try {
        catalog = catalogOf(locale, await this.requireClient().articles(locale));
      } catch (err) {
        this.logger.warn(`Reading the Bring! articles in ${locale} failed: ${err.message}`);
        catalog = cached?.catalog ?? catalog;
        ttl = CATALOG_RETRY;
      }
    }
    this.catalogs.set(locale, { catalog, until: this.now() + ttl });
    return catalog;
  }

  async resolveList(query) {
    await this.loadDirectory();
    const list = findList(this.lists, query, this.client.defaultListUuid);
    if (!list) {
      throw new Error(
        T.unknownList(
          String(query ?? ''),
          this.lists.map((l) => l.name),
        ).en,
      );
    }
    return list;
  }

  // --- Reading ---------------------------------------------------------------------

  async readList(list) {
    const catalog = await this.catalog(this.localeOf(list));
    const raw = await this.requireClient().items(list.uuid);
    return readingOf(raw, { list, catalog, now: this.now() });
  }

  /**
   * Keep a reading and fire the scene events of the transition. `expected`
   * replaces the previous reading after a change made through Gladys (see
   * applyChange): only the changes made elsewhere fire.
   */
  async adopt(list, reading, expected) {
    const generation = this.generation;
    const stored = this.readings.get(list.uuid);
    this.readings.set(list.uuid, reading);
    const events = this.config.watchLists ? listEvents(expected ?? stored, reading) : [];
    for (const event of events) {
      if (generation !== this.generation) {
        return;
      }
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
    if (signature(stored) !== signature(reading)) {
      this.gladys.requestWidgetRefresh(WIDGETS.LIST);
    }
  }

  /** The last reading when young enough, a new one otherwise. */
  async freshReading(list, maxAge = READING_MAX_AGE) {
    const known = this.readings.get(list.uuid);
    if (known && this.now() - Date.parse(known.readAt) < maxAge) {
      return known;
    }
    const reading = await this.readList(list);
    await this.adopt(list, reading);
    return reading;
  }

  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.exclusive(() => this.refreshAll()).finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  async refreshAll() {
    const generation = this.generation;
    await this.loadDirectory();
    let failure;
    for (const list of this.lists) {
      if (generation !== this.generation) {
        return;
      }
      try {
        await this.adopt(list, await this.readList(list));
      } catch (err) {
        if (err instanceof BringError && err.final) {
          throw err;
        }
        if (err instanceof BringError && err.code === 'not_found') {
          // A list deleted in the app: read the lists again at the next refresh.
          this.logger.warn(`The list ${list.name} is gone`);
          this.readings.delete(list.uuid);
          this.directoryAt = 0;
          continue;
        }
        failure = err;
        this.logger.warn(`Reading the list ${list.name} failed: ${err.message}`);
      }
    }
    if (failure) {
      throw failure;
    }
    await this.reportOk();
  }

  /** Send one change, then read the list again right away. */
  async changeItem(list, { key, name, spec = '', uuid = null, operation }) {
    await this.requireClient().change(list.uuid, [changeOf({ key, spec, uuid, operation })]);
    const expected = applyChange(this.readings.get(list.uuid), { key, name, spec, operation });
    const reading = await this.readList(list);
    await this.adopt(list, reading, expected);
    return reading;
  }

  // --- Scene actions -------------------------------------------------------------------

  /** "Add an item": the name in the list's language is sent as its catalog key when it is one. */
  addItem(fields = {}) {
    return this.exclusive(async () => {
      this.requireClient();
      const text = String(fields.item ?? '').trim();
      if (!text) {
        throw new Error('No item to add');
      }
      const list = await this.resolveList(fields.list);
      const catalog = await this.catalog(this.localeOf(list));
      const key = catalog.toKey(text);
      const reading = await this.changeItem(list, {
        key,
        name: catalog.toName(key),
        spec: String(fields.specification ?? '').trim(),
        operation: OPERATIONS.ADD,
      });
      this.logger.info(`Item added to the Bring! list ${list.name}`);
      return { list: list.name, item: catalog.toName(key), count: reading.purchase.length };
    });
  }

  completeItem(fields = {}) {
    return this.settleItem(fields, OPERATIONS.COMPLETE);
  }

  removeItem(fields = {}) {
    return this.settleItem(fields, OPERATIONS.REMOVE);
  }

  /** Check off or remove an item of the list; `done: false` when it is not on it. */
  settleItem(fields, operation) {
    return this.exclusive(async () => {
      this.requireClient();
      const text = String(fields.item ?? '').trim();
      if (!text) {
        throw new Error('No item given');
      }
      const list = await this.resolveList(fields.list);
      const catalog = await this.catalog(this.localeOf(list));
      const before = await this.freshReading(list);
      const item = findItem(before.purchase, text, catalog);
      if (!item) {
        return { list: list.name, item: text, done: false, count: before.purchase.length };
      }
      const reading = await this.changeItem(list, {
        ...item,
        spec: operation === OPERATIONS.REMOVE ? '' : item.spec,
        operation,
      });
      return { list: list.name, item: item.name, done: true, count: reading.purchase.length };
    });
  }

  /** "Read a list": the count and the items as one comma-separated text. */
  getList(fields = {}) {
    return this.exclusive(async () => {
      this.requireClient();
      const list = await this.resolveList(fields.list);
      const reading = await this.freshReading(list);
      return {
        list: list.name,
        count: reading.purchase.length,
        items: itemsText(reading).slice(0, 10_000),
      };
    });
  }

  // --- Dashboard widget ----------------------------------------------------------------

  async getWidget({ settings = {} } = {}) {
    if (!this.client) {
      return messageWidget(T.widget.notConfigured);
    }
    const pollMs = this.config.pollMinutes * 60_000;
    try {
      return await this.exclusive(async () => {
        await this.loadDirectory();
        const list = findList(this.lists, settings.list, this.client.defaultListUuid);
        if (!list) {
          return messageWidget(
            T.unknownList(
              String(settings.list ?? ''),
              this.lists.map((l) => l.name),
            ),
          );
        }
        // While watching, the poll keeps the reading fresh: no extra call.
        const reading = await this.freshReading(
          list,
          this.config.watchLists ? pollMs + READING_MAX_AGE : READING_MAX_AGE,
        );
        return listWidget({ reading, quickItem: settings.quick_item, ttl: pollMs / 1000 });
      });
    } catch (err) {
      return messageWidget(T.widget.failed(err.message), { ttl: 60 });
    }
  }

  async widgetAction(actionKey, _params, { settings = {}, values } = {}) {
    if (!this.client) {
      return T.widget.notConfigured;
    }
    try {
      if (actionKey === WIDGET_ACTIONS.QUICK_ADD) {
        const item = String(settings.quick_item ?? '').trim();
        if (!item) {
          return T.widget.noQuickItem;
        }
        const added = await this.addItem({ list: settings.list, item });
        return toast(T.widget.added(added.item));
      }
      // An older core drops the form and relays the tap without values.
      if (!values) {
        return T.widget.needsForm;
      }
      if (actionKey === WIDGET_ACTIONS.ADD) {
        const added = await this.addItem({
          list: settings.list,
          item: values.item,
          specification: values.specification,
        });
        return toast(T.widget.added(added.item));
      }
      if (actionKey === WIDGET_ACTIONS.CHECK_OFF) {
        const done = await this.completeItem({ list: settings.list, item: values.item });
        return toast(done.done ? T.widget.checked(done.item) : T.widget.notOnList(done.item));
      }
      return undefined;
    } catch (err) {
      return toast(T.widget.failed(err.message));
    }
  }

  // --- Configuration screen button ------------------------------------------------------

  async testConnection() {
    if (!this.client) {
      return T.notConfigured;
    }
    try {
      return await this.exclusive(async () => {
        await this.loadDirectory({ force: true });
        const lines = [];
        for (const list of this.lists) {
          const reading = await this.freshReading(list, 0);
          lines.push({ name: list.name, count: reading.purchase.length, locale: reading.locale });
        }
        await this.reportOk();
        return T.testOk(lines);
      });
    } catch (err) {
      await this.reportError(err);
      return T.testFailed(err.code ?? 'error', err.message);
    }
  }
}
