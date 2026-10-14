# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `provider` (no device):
a Node.js service (Node 22+, ESM, no build step) in its own sandboxed Docker
container, talking to Gladys through `@gladysassistant/integration-sdk`
(v0.15). It signs in to a **Bring!** account (email + password, the
unofficial API of the Bring! web app) and puts the shopping lists on the
dashboard (a widget with add / check off forms) and in the scenes (actions
add, check off, remove, read; triggers item added, item checked off, list
emptied). Unofficial: not affiliated with Bring! Labs.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK wiring only (handlers registered before connect())
src/app.js          BringApp: session, lists, refresh loop, scene actions,
                    widget, test button
src/bring/api.js    the Bring! client: headers, sign-in, token renewal,
                    endpoints (every Bring! URL and header is here)
src/bring/model.js  Bring! JSON -> lists / items / readings, the article
                    catalog (translations both ways), change bodies (pure)
src/lists.js        find a list / an item, texts, applyChange (pure)
src/triggers.js     two readings -> scene events (pure)
src/widget.js       the "shopping_list" widget (pure)
src/config.js       config_schema normalized, the session, configFingerprint
src/constants.js    pacing, limits, the manifest keys, SESSION_KEY
src/i18n.js         runtime texts (en/fr)
src/http.js         the only network access (fetch, timeout, User-Agent)
test/fixtures/      Bring! answers shaped after the bring-api library types;
                    the error answers and the article files are real
test/helpers/       a fake Bring! (routes + list state), fake timers;
                    Gladys is the SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with Bring! Labs". Never use the Bring! logo or its red.
- **Keys are forever**: the manifest keys (`src/constants.js`), the widget
  setting keys (`list`, `quick_item`), the event data keys and the
  off-schema `SESSION_KEY` are stored in user scenes, dashboards and
  configurations. Never rename them.
- **The password goes to Bring! only**: never logged, never in an error, a
  status or a scene event. The session (user uuid + refresh token, JSON)
  is saved through `setConfig` under `SESSION_KEY`; a config update that
  only saved it must not restart the app (`configFingerprint`).
- **A refused password is final** until the configuration changes
  (`BringError.final`): no retry loop that could lock the account. A refused
  refresh token falls back to the password once.
- **Be polite with Bring!**: each watched list every `poll_minutes` (2 by
  default, never below 1) and right after a change made through Gladys; the
  list names and languages once an hour; the translation files once a day.
  Nothing in the background when `watch_lists` is off. Calls never overlap
  (`exclusive`).
- **One event per transition** (`src/triggers.js`), items compared by key:
  the first reading fires nothing, a spec edit is not a new item, and the
  changes made through Gladys fire nothing (`applyChange`): no scene loop.
- **Built blind**: no account to test with. Every Bring!-specific name lives
  in `src/bring/` so a user report fixes one place; the doubts are in
  `TODO.md`.
- **Read-only rootfs**: write nothing on disk; the translations stay in memory.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (`installBring` replaces `fetch`).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.

## Refreshing the fixtures

The article files are trimmed copies of the public translation files:

```bash
curl -s https://web.getbring.com/locale/articles.fr-FR.json | python3 -m json.tool
```

The other fixtures follow the dataclasses of `bring-api` (`pip download
bring-api --no-deps`, `bring_api/types.py`); replace them with real answers
(anonymized) as soon as an account is available.
