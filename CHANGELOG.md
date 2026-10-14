# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Fixed

- Docs: the outputs of the scene actions come from the variable list
  (`{{<step>.<action>.<key>}}`), not `{{<key>}}`.

## [0.1.1] - 2026-10-14

### Added

- Sign-in to a Bring! account with its email and password (sent to Bring!
  only); the session is kept in the Gladys configuration so a restart does
  not send the password again, and a refused password is never retried in a
  loop.
- Dashboard widget "Bring! shopping list": the items to buy of a list, an
  "Add" form, a "Check off" form listing the items and an optional one-tap
  item.
- Scene actions "add an item", "check off an item", "remove an item" and
  "read a list" (count and items as a comma-separated text).
- Scene triggers "item added", "item checked off" and "list emptied", from
  the lists read every 2 minutes (configurable, or off).
- Item names translated both ways with the Bring! catalog: "lait" is added
  as the catalog article "Milch" and shown as "Lait".
- "Test the account" button.

[Unreleased]: https://github.com/LM1LC3N7/gladys-bring/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-bring/releases/tag/v0.1.1
