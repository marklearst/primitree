# MonoLisa webfonts

The docs site and homepage use licensed MonoLisa webfonts. This public repository does not
distribute the font binaries, and the root `.gitignore` keeps them out of commits.

Place the 26 original WOFF2 files from the MonoLisa webfont package in this directory.
Keep the supplied names: `{0..25}-MonoLisa-{normal,italic}.woff2`.

Each file is a variable font covering one unicode range, in normal or italic.
`app/monolisa.css` declares a weight range of 100 to 900 for all 26 files. The browser
downloads the ranges a page uses and skips the rest. The site preloads none of them.

Without the files, code renders in the system monospace font. Contributors work in that
state.

Deploys fetch the files the same way as Wotfard. See `../wotfard/README.md`.
