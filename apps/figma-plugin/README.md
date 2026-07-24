# FigmaVars Export

FigmaVars Export is the Figma plugin in the
[FigmaVars repository](https://github.com/marklearst/figmavars). It reads local
variable collections and variables from the open file, then downloads a
`variables.json` file for `figma-vars build`.

The plugin works on any Figma plan and does not call the Enterprise Variables
REST API. Its manifest allows no network domains.

This repository setup covers local development. The release checklist below
covers Figma Community submission.

## Build

```sh
pnpm install
pnpm --filter figmavars-plugin build
pnpm --filter figmavars-plugin dev
```

The `dev` command watches the plugin files.

## Load the development build

1. Open the Figma desktop app.
2. Choose Plugins > Development > Import plugin from manifest.
3. Select `apps/figma-plugin/dist/manifest.json`.
4. Run FigmaVars Export in a file that contains local variables.

The build command writes the plugin files under `apps/figma-plugin/dist`.

## Export shape

```json
{
  "status": 200,
  "error": false,
  "meta": {
    "variableCollections": {},
    "variables": {}
  }
}
```

Build the token files from the downloaded export:

```sh
npx @figmavars/cli build variables.json
```

## Shared serializer

The private `@figmavars/plugin-export` workspace package maps plugin data to
the REST-shaped export. Its tests cover serialization outside the Figma
sandbox.

## Prepare a Figma Community release

Replace the development plugin ID in `manifest.json` with the ID assigned by
Figma. Add the required icon assets under `apps/figma-plugin` before
submission.
