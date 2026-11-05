# Opening book data

`openings.generated.ts` is generated from the Lichess opening list:

- Source: https://github.com/lichess-org/chess-openings
- Pinned commit: `3fd6ce992679e4d991a6bb4dade71f2b826c568a` (files `a.tsv` to `e.tsv`)
- Licence: CC0 1.0 Universal (public domain dedication). No attribution is required; we credit the source anyway.

## Regenerating

```sh
npm run gen:openings                  # fetches the TSVs at the pinned commit
npm run gen:openings -- --dir <path>  # or reads them from a local checkout
```

To update the data, change `SHA` in `scripts/gen-openings.mjs`, regenerate, update the commit above and commit the new `openings.generated.ts`. The script fails if the output grows past 500 KB. The data is bundled into its own lazily loaded chunk; nothing is fetched at runtime.
