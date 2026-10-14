# Bring!

**Unofficial connector, not affiliated with Bring! Labs.** It brings your
[Bring!](https://www.getbring.com/) shopping lists into Gladys: a dashboard
widget to see, add and check off items, scene actions and scene triggers.
Bring! has no public API: the integration talks to Bring! the way the Bring!
web app does, which Bring! may change at any time. Bring! is a trademark of
Bring! Labs AG.

## What you get

| Surface          | Content                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard widget | **Bring! shopping list**: the items to buy of one list, an **Add** form, a **Check off** form listing the items, an optional one-tap item          |
| Scene actions    | **add an item** (list, item, details), **check off an item**, **remove an item**, **read a list** (number of items, the items separated by commas) |
| Scene triggers   | **item added**, **item checked off**, **list emptied** (the shopping is done)                                                                      |

No device is created: Bring! lists are not devices.

## Setup

1. Install the integration, open its configuration and enter the **email**
   and the **password** of your Bring! account. The password is sent only to
   Bring! (`api.getbring.com`); Gladys stores it encrypted.
2. Click **Test the account**: it lists your lists, their number of items and
   the language of their articles.
3. Put the **Bring! shopping list** widget on a dashboard. Type the name of a
   list in its settings, or leave it empty for your default list. A one-tap
   item (for example "Milk") adds a button that puts it on the list at once.

If you sign in to Bring! with Google or Apple, your account may have no
password. Create a second Bring! account with an email and a password, then
invite it to your lists from the Bring! app: the integration sees the shared
lists.

### Item names

Bring! stores the items of its catalog under a German name ("Milch") and
shows them in the language of each list ("Milk", "Lait"). The integration
does the same in both directions: the widget and the scenes show "Milk", and
when you add "milk" to an English list, it adds the catalog article (with its
icon). A text that is not in the catalog ("AA batteries") is added as is.

## Scenes

- **Item added**: someone added an item to a list, in the Bring! app or on
  a shared list. Variables: the list, the item, its details, the number of
  items to buy.
- **Item checked off**: an item was bought (checked off in the app). A removed
  item does not count.
- **List emptied**: the last item of a list was checked off or removed.

The filters compare exactly: type the list and the item as Bring! shows them
("Groceries", "Milk"), or leave them empty for any. The changes made through
Gladys (a scene action, the widget) fire no trigger, so a scene cannot loop
through the integration.

The actions return values for the steps that follow: **add an item** gives
`item` and `count`, **check off** and **remove** give `done` (false when the
item was not on the list), **read a list** gives `count` and `items`
("Milk (2 l), Bread, Eggs"), handy in a message. The following actions of
the scene find them in their variable list (written
`{{<step>.<action>.<key>}}`, for instance `{{0.0.items}}` when
**read a list** is the first action of the scene).

## Pace

While the lists are watched (option **Watch the lists**, on by default),
each list is read every 2 minutes (option **Refresh interval**, 1 minute at
least), and right after a change made through Gladys. The names of the lists
and their language are read once an hour, the article translations once a
day. With the option off, nothing runs in the background: the widget and the
actions read a list when they need it, and the triggers never fire.

## Troubleshooting

- **"Bring! refused the email or the password"**: fix them in the
  configuration and save; the integration does not try again by itself, so
  a wrong password cannot lock your account.
- **"Bring! is unreachable"**: the integration tries again at the next
  refresh. If it lasts, Bring! may have changed its web API: open an issue.
- **A trigger does not fire**: check that the lists are watched and that the
  filter is spelled exactly like in Bring! (case included).
- **The widget forms do nothing**: the forms behind a button need Gladys 5.2
  or later; the one-tap item works on 5.1.
- Logs: the integration's log level is set with the `LOG_LEVEL` variable.

## Privacy

The email and the password are sent only to Bring!, never logged. After the
first sign-in, the integration keeps the Bring! session (your user id and a
renewal token) in the Gladys configuration, so a restart does not send the
password again. The lists stay between Gladys and Bring!.
