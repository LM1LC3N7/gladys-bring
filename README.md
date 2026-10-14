# gladys-bring

[Gladys Assistant](https://gladysassistant.com) external integration for
**[Bring!](https://www.getbring.com/) shopping lists**: lists on the
dashboard, add and check off items, scene actions "add an item", "check off",
"remove", "read a list", scene triggers "item added", "item checked off",
"list emptied". **Unofficial, not affiliated with Bring! Labs.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (BringApp)
                 ├─ src/bring/api.js     sign-in, token renewal, lists, items, changes
                 ├─ src/bring/model.js   Bring! JSON -> readings, article catalog (pure)
                 ├─ src/lists.js         find a list / an item, own changes (pure)
                 ├─ src/triggers.js      two readings -> scene events (pure)
                 └─ src/widget.js        the shopping list widget (pure)
```

- **Account**: email and password (a `secret` field), sent to Bring! only.
  The session (user uuid + refresh token) is kept off-schema in the Gladys
  configuration, so a restart renews the token instead of signing in again.
- **Reading**: every list every 2 minutes while watched (`watch_lists`), and
  right after a change made through Gladys; the list names and languages
  hourly, the article translations daily. No background call when the lists
  are not watched.
- **Item names** are catalog keys in German ("Milch"): they are shown in the
  list's language ("Lait") and a typed "lait" is sent as "Milch", from the
  public translation files of the web app. Free text goes as is.
- **Triggers** come from two consecutive readings (items compared by key):
  the first reading fires nothing, and the changes made through Gladys fire
  nothing either, so no scene can loop through the integration.
- **Widget**: the items to buy, an "Add" form, a "Check off" form listing the
  items (the vocabulary allows 4 buttons, not one per item) and an optional
  one-tap item. Forms need Gladys 5.2; the one-tap item works on 5.1.

Built blind: the API is the one the `bring-api` library (used by the Home
Assistant integration) calls; see [TODO.md](TODO.md) for what to confirm
with a real account.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0. Bring! is a trademark of Bring! Labs AG.
