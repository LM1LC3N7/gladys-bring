# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+ (and 5.2 for the widget forms) with a real
      Bring! account and two shared lists: sign-in, the session kept across
      a restart, the widget (add, check off, one-tap item), the four scene
      actions, the three triggers while someone uses the Bring! app.
- [ ] Check what an account opened with Google or Apple sign-in can do (no
      password?) and adjust the guide.
- [ ] Reserve "Bring!" in the forum thread t/10385, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm with a real account (built blind)

- [ ] `GET v2/bringlists/{listUuid}` answers the nested shape
      (`items.purchase[].itemId/uuid/specification`) of bring-api 1.1.2; the
      older flat shape (`purchase[].name`) is still parsed.
- [ ] `PUT v2/bringlists/{listUuid}/items` with `{ changes, sender: "" }`
      answers 2xx, and `uuid: null` is accepted on an add (the library sends
      it so).
- [ ] An item checked off keeps its `itemId` in `recently` (the "item checked
      off" trigger relies on it) and adding an item already in `recently`
      moves it back.
- [ ] The headers of the bring-api library (`X-BRING-CLIENT: android` with
      the public API key) work for a real account; verified only for the
      error answers (400 "Invalid Email.", 401 JSON).
- [ ] `expires_in` of the access token, and whether the refresh token rotates
      (the integration saves a new one when it comes).
- [ ] `bringusersettings/{uuid}` gives `listArticleLanguage` for every list,
      and `v2/bringusers/{uuid}` its `userLocale` (used for the
      `X-BRING-COUNTRY` header and the lists without a language).
- [ ] The scene filters compare strings exactly (case included): if the core
      does, document it; if users struggle, offer the folded names as extra
      variables.
- [ ] The live `articles.fr-FR.json` (2025-07) lacks a few keys the library
      bundles (`Pfeffer`, `Kaffeebohnen`): such items show their German key.
- [ ] Two entries with the same `itemId` on one list are seen as one.
- [ ] A form `select` with many items (30+) stays usable in the card.

## Ideas

- Recent items in the widget, with a "put back" form.
- Urgent / convenient / discounted attributes (bring-api `ATTRIBUTE_UPDATE`).
- The "going shopping" / "shopping done" notifications
  (`v2/bringnotifications/lists/{listUuid}`) as a scene action.
- A `lists` filter to watch only some lists.
