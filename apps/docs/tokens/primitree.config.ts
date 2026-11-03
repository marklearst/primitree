const architecture = {
  layers: [
    { id: 'primitives', roots: ['primitives'], values: 'literal' },
    {
      id: 'semantic',
      roots: ['semantic'],
      values: 'reference',
      references: ['primitives'],
    },
    {
      id: 'component',
      roots: ['component'],
      values: 'reference',
      references: ['semantic'],
    },
  ],
}

const ownership = {
  default: ['design-systems'],
  paths: { semantic: ['product-design'] },
}

const source = (name: string) => ({
  type: 'dtcg',
  file: `./generated/resolved/${name}.tokens.json`,
  architecture,
  ownership,
  outputs: {
    directory: `./generated/cli/${name}`,
    formats: ['dtcg', 'css', 'typescript'],
  },
})

// A source reads one flat file, so each theme and motion context checks
// as its own source. scripts/build-site-tokens.mjs writes those files
// with applyResolver.
export default {
  schemaVersion: 1,
  sources: {
    'light-full': source('light-full'),
    'dark-full': source('dark-full'),
    'light-reduced': source('light-reduced'),
    'dark-reduced': source('dark-reduced'),
  },
}
