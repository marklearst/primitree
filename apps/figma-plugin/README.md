# Primitree Export

Primitree Export is the Figma plugin in the
[Primitree repository](https://github.com/marklearst/primitree). It reads local
variable collections and variables from the open file and downloads a
`variables.json` file for `primitree build`.

The plugin uses Figma's local Plugin API and does not call the Enterprise
Variables REST API. Its manifest declares no allowed network domains.

The repository covers local development. Use the Figma Community release
checklist for submission.

## Build

```sh
pnpm install
pnpm --filter primitree-plugin build
pnpm --filter primitree-plugin dev
```

The `dev` command watches the plugin files.

## Load the development build

1. Open the Figma desktop app.
2. Choose Plugins > Development > Import plugin from manifest.
3. Select `apps/figma-plugin/dist/manifest.json`.
4. Run Primitree Export in a file that contains local variables.

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
npx @primitree/cli build variables.json
```

## Shared serializer

The private `@primitree/plugin-export` workspace package maps plugin data to
the REST-shaped export. Its tests cover serialization outside the Figma
sandbox.

## Prepare a Figma Community release

Replace the development plugin ID in `manifest.json` with the Figma Community
plugin ID. Add the required icon assets under `apps/figma-plugin` before
submission.
