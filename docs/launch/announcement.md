# Launch kit — FigmaVars v5

Draft copy for the v5 launch. Adjust voice as needed; every claim below is
implemented and tested in the repo.

---

## Show HN post

**Title options (pick one, max ~80 chars):**

1. `Show HN: Turn a Figma variables export into a full design-token pipeline`
2. `Show HN: FigmaVars – Figma variables to DTCG tokens, CSS, Tailwind, and CI`
3. `Show HN: Design tokens from Figma without the Enterprise API`

**Body:**

Hi HN — I maintain a small React hooks library for Figma Variables. It had a
structural problem: Figma's Variables REST API is Enterprise-only, so most
people could never use it. Instead of polishing a library nobody could adopt,
I rebuilt it around the one thing everyone has: the variables JSON you can
export from any Figma plan (plugins like TokensBrücke, Dev Mode, or the REST
API if you have it).

`npx @figma-vars/cli build variables.json` gives you:

- DTCG 2025.10 token files (one per collection, aliases preserved as
  references) plus a Resolver document that maps Figma modes to standard
  contexts (light/dark, density, brand)
- CSS custom properties with `[data-theme]` blocks, a Tailwind v4 `@theme`
  file, TypeScript types, and a prewired Style Dictionary or Terrazzo config
- a GitHub Action that rebuilds everything when a new export lands

The part I'm most excited about is `figma-vars diff`: it matches variables by
their stable Figma IDs, so a rename shows up as a rename instead of a
remove+add. With `--fail-on-breaking` you can gate CI on design-token changes
the way you gate on API changes.

There's also an MCP server (`@figma-vars/mcp`) so coding agents can query
your actual tokens (get/search/resolve/diff) instead of hallucinating hex
values, React hooks that consume the built artifacts with runtime theme
switching (no Figma token needed), and a playground that runs entirely
client-side — drop a JSON, preview every mode, download the pipeline as a
zip. Nothing is uploaded anywhere.

Everything is MIT. I'd love feedback on the DTCG mapping decisions
(especially FLOAT type inference and how modes become resolver modifiers).

**Link:** https://github.com/marklearst/figma-vars-hooks

---

## X / Bluesky thread

**1/**
Figma's Variables API is Enterprise-only. Your design tokens shouldn't be.

FigmaVars v5: drop in the variables JSON anyone can export, get a production
token pipeline — DTCG 2025.10, CSS, Tailwind v4, TypeScript, CI. In one
command.

**2/**
`npx @figma-vars/cli build variables.json`

→ tokens split by collection, aliases kept as references
→ a DTCG Resolver mapping your Figma modes to light/dark contexts
→ tokens.css with [data-theme] blocks
→ @theme for Tailwind v4
→ typed TokenPath union

**3/**
The sleeper feature: `figma-vars diff` matches by stable Figma IDs.

Renames are renames. Not remove+add.

`--fail-on-breaking` turns design-token changes into CI events your team
reviews like code.

**4/**
AI angle: `@figma-vars/mcp` serves your tokens to Cursor/Claude Code.

get_token, search_tokens, resolve_context ("what does dark mode look
like?"), diff_tokens.

Your agent stops inventing hex values. Local-first, nothing uploaded.

**5/**
React hooks now work on every Figma plan — they consume built artifacts, not
the Enterprise API:

useToken('semantic.color.bg.brand') → value, css, var()
useTheme() → setContext('semantic', 'dark')

SSR-safe. No PAT in the browser. MIT.

github.com/marklearst/figma-vars-hooks

---

## Newsletter blurb (design systems newsletters)

**FigmaVars v5 — from variables export to token pipeline in one command.**
FigmaVars converts any Figma variables JSON (no Enterprise plan required)
into DTCG 2025.10 token files with a standards-compliant Resolver for modes,
plus generated CSS custom properties, a Tailwind v4 theme, TypeScript types,
and a prewired Style Dictionary/Terrazzo config. A semantic `diff` command
matches variables by stable Figma IDs to catch breaking token changes in CI,
React hooks consume the built artifacts with runtime theme switching, and an
MCP server exposes the whole token graph to AI coding agents. A fully
client-side playground lets you try it without installing anything. MIT.

---

## 60-second demo recording script

Record with [vhs](https://github.com/charmbracelet/vhs) or asciinema; target
~60s total. Suggested `demo.tape`:

```tape
Output demo.gif
Set FontSize 18
Set Width 1200
Set Height 640
Set Theme "Catppuccin Mocha"

Type "npx @figma-vars/cli init my-tokens" Enter
Sleep 3s
Type "cd my-tokens && ls" Enter
Sleep 2s
Type "cat tokens/tokens.resolver.json | head -20" Enter
Sleep 3s
Type "head -18 css/tokens.css" Enter
Sleep 3s
# edit variables.json (rename a variable) beforehand in a second take
Type "npx @figma-vars/cli diff backup/variables.json variables.json" Enter
Sleep 5s
```

Frame 1 alt: drag `variables.json` into the playground, click a mode chip,
hit "Download pipeline (.zip)" — screen-record for the README hero GIF.

---

## Launch checklist

- [ ] Push `main` and tags: `git push && git push origin v4.2.0 v5.0.0`
      (tag push triggers the npm publish workflow; verify NPM_TOKEN secret)
- [ ] Verify all five packages on npm (cli, core, dtcg, hooks, mcp)
- [ ] Deploy `apps/playground/dist` (GitHub Pages / Netlify / Vercel — it's
      static; `pnpm --filter figma-vars-playground build`)
- [ ] Record the 60s GIF and embed at the top of the root README
- [ ] Rename the GitHub repo `figma-vars-hooks` → `figma-vars` (redirects
      are automatic; update badge/links in READMEs afterward)
- [ ] Post Show HN (Tue–Thu, 8–10am ET tends to do best)
- [ ] Thread on X/Bluesky; cross-post to r/DesignSystems, r/FigmaDesign
- [ ] Submit to newsletters: Design Systems Weekly, UI Dev Newsletter,
      Figmalion, News.design
- [ ] Open a "Show and tell" in the Style Dictionary and Terrazzo discussion
      boards (the generated configs feed their tools — friendly ecosystem play)

```

```
