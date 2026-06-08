# FigmaVars Export (Figma plugin)

Official export plugin for [FigmaVars](https://figmavars.com). Reads **all local variables** in the current file and downloads `variables.json` in the shape `figma-vars build` expects.

Works on **any Figma plan** (no Enterprise REST API required).

## Develop

```sh
pnpm install
pnpm --filter figmavars-plugin build
pnpm --filter figmavars-plugin dev   # watch mode
```

## Load in Figma

1. Open Figma desktop
2. Plugins → Development → Import plugin from manifest
3. Select `apps/figma-plugin/dist/manifest.json`
4. Run **FigmaVars Export** on a file with variables

## Output

REST-shaped JSON:

```json
{
  "status": 200,
  "error": false,
  "meta": {
    "variableCollections": { ... },
    "variables": { ... }
  }
}
```

Then:

```sh
figma-vars build variables.json
```

## Monorepo packages

- `@figmavars/plugin-export` — serializer (tested, shared with plugin bundle)
- Plugin UI — thin Figma sandbox shell

## Publish

Before Community publish, generate a unique plugin id in `manifest.json` and add icons under `apps/figma-plugin/`.
