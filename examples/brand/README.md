# Brand example

A small starter token set: 15 tokens in three layers. Primitives hold literal values, semantic tokens reference primitives, and
component tokens reference semantic tokens. `primitree.config.ts` enforces that order and
assigns `product-design` as the owner of `semantic.*`.

Run each command from this folder.

## Check the source

```console
$ npx primitree@next check --source brand
Check passed for source "brand" with 15 tokens.
```

## Catch a layer skip

`proposals/layer-skip.tokens.json` points `component.button.bg` straight at a primitive. The
config declares it as a second source named `layer-skip`.

```console
$ npx primitree@next check --source layer-skip
PT1004 component.button.bg: Layer component cannot reference layer primitives.
Check found 1 active finding for source "layer-skip".
```

The command exits with code 1, which fails a CI job. A build of the same source
stops before it writes anything:

```console
$ npx primitree@next build --source layer-skip
PT1004 component.button.bg: Layer component cannot reference layer primitives.
Build stopped with 1 active finding for source "layer-skip".
```

## See what a rename reaches

`proposals/rename.tokens.json` renames `semantic.color.bg.brand` to
`semantic.color.bg.primary` and repoints its three consumers.

```console
$ npx primitree@next diff tokens.json proposals/rename.tokens.json --source brand
Diff found 5 token changes.
changed component.button.bg
  Affected tokens: none
changed component.focus.ring
  Affected tokens: none
changed component.nav.active.bg
  Affected tokens: none
removed semantic.color.bg.brand
  Affected tokens: component.button.bg, component.focus.ring, component.nav.active.bg
added semantic.color.bg.primary
  Affected tokens: component.button.bg, component.focus.ring, component.nav.active.bg
New findings: 0
Resolved findings: 0
```

## Explain one token

```console
$ npx primitree@next inspect semantic.color.bg.brand --source brand
Token: semantic.color.bg.brand
ID: source:brand/token:semantic.color.bg.brand
Source: brand
Type: color
Value: {"colorSpace":"srgb","components":[0.2,0.4,1],"alpha":1}
Alias chain: semantic.color.bg.brand -> primitives.color.blue.500
Owners: product-design
Direct dependents: component.button.bg, component.focus.ring, component.nav.active.bg
Source file: tokens.json
Token pointer: /semantic/color/bg/brand
```

## Build the files

```console
$ npx primitree@next build --source brand
Built 6 files for source "brand" in ./generated.
```

The build writes DTCG, CSS, Tailwind v4, and TypeScript files to `generated/`, plus
`.primitree-manifest.json`. `primitree build --source brand --check` reports missing, changed,
and unexpected files without writing.
