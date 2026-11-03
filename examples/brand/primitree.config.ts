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

export default {
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './tokens.json',
      architecture,
      ownership,
      outputs: {
        directory: './generated',
        formats: ['dtcg', 'css', 'tailwind', 'typescript'],
      },
    },
    // A second source for the homepage demo: the same rules over a proposal
    // in which button.bg skips the semantic layer. A project needs one source
    // per token file it checks.
    'layer-skip': {
      type: 'dtcg',
      file: './proposals/layer-skip.tokens.json',
      architecture,
      ownership,
      outputs: { directory: './generated-layer-skip', formats: ['css'] },
    },
  },
}
