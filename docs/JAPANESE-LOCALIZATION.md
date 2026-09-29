# Japanese localization

The title-screen Japanese/English switch persists locally. Japanese text is bundled in the app; gameplay makes no translation-service requests.

## Catalogs
- `src/scripts/53-japanese-catalog.js`: reviewed UI labels and terminology overrides.
- `src/scripts/53-japanese-content.js`: generated offline translations of 4,892 identified non-story display strings (menus, card rules, tutorials, missions, AI dialogue, status messages, and dynamic templates).
- `src/scripts/53-japanese-subtitles.js`: consolidation dialogue and card-flavor fallback subtitles, translated separately so story/lore content remains excluded.
- `src/scripts/54-localization.js`: reversible DOM localization, accessible attributes, dynamic messages, and source-text access for legacy UI actions.
- Canvas renderers translate labels before measurement/drawing; card-texture caches clear on language changes.
- `src/styles/localization-generated.css`: Japanese CSS-generated labels with English fallbacks in their original stylesheets.

Consolidation subtitles are translated before line-break measurement and positioning. Original manual line breaks are retained. Voice recordings remain in their original language. Authored lore pages now have an offline Japanese catalog, including full article overrides. Player-authored names and chat messages are protected.

## Updating translations
`node tools/localization-inventory.cjs` inventories statically identified display text. `node tools/localization-translate.cjs --google-consent` sends only that inventory to Google Translate and saves the offline catalog. This requires explicit authorization to use Google Translate. `node tools/localization-subtitles.cjs` similarly updates authored consolidation dialogue. These development tools never read saves or player messages.

Generated translations use machine translation and can be adjusted in the reviewed catalog. Source inventory completion is not a guarantee that every possible runtime phrase has been exercised. `FateI18n.report()` exposes unmatched runtime strings locally for follow-up.

## Validation status
The earlier isolated language-switch smoke test passed switching, dynamic DOM updates, placeholders, nested markup, English restoration, preserved player names, and saved preference restoration. An initial game-screen pass identified additional gaps which were added to the catalogs. Further checks were stopped at the user's request; the final expansion and consolidation subtitles are ready for the user's in-game testing.

## Lore coverage
The lore generator includes both structured page fields and the full articles in DOCUMENT_EXACT_BODIES, plus the Card Information 5 overrides. Run `node tools/localization-lore-translate.cjs --check` for an offline check that every inventoried string is present and current in the bundle. Run the generator without `--check` only with authorization to send missing authored text to Google Translate. The localization smoke test checks Japanese rendering and English restoration for all long lore paragraphs.
