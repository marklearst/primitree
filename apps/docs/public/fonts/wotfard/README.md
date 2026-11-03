# Wotfard webfonts

The docs site and homepage use licensed Wotfard webfonts. This public repository does not
distribute the font binaries, and the root `.gitignore` keeps them out of commits.

Place the original WOFF2 files for Light, Regular, and Medium, including their matching
italics, in this directory. Keep the supplied names:
`wotfard-{light,regular,medium}{italic,}-webfont.woff2`. `app/fonts.css` declares them, and
`app/layout.tsx` preloads Regular and Medium.

Wotfard ships no weight above Medium (500). The site sets `font-synthesis: none`, so a
style that asks for 600 renders Medium instead of a browser-faked bold.

Without the files, the site renders with system fonts. Contributors work in that state.

Vercel builds start from a clone without the binaries. The docs `build` script first runs
`scripts/fetch-webfonts.mjs`, which downloads the missing files from private Vercel Blob
storage with `BLOB_READ_WRITE_TOKEN`. On Vercel (`VERCEL=1`) a missing token or file fails
the build. Elsewhere the script prints a warning and the build continues.

To seed the store, run `pnpm --filter primitree-docs fonts:upload` from a checkout that has
the originals, with the token in `apps/docs/.env.local`. A store that already holds
`fonts/wotfard/*` and `fonts/monolisa/*` also works: connect it to the Primitree project.
