export const docsRoute = '/docs'
export const docsContentRoute = '/llms.mdx/docs'

export const gitConfig = {
  user: 'marklearst',
  repo: 'primitree',
  branch: 'main',
}

export function getDocsGithubUrl(pagePath: string) {
  if (pagePath === 'api/index.mdx' || pagePath.startsWith('api/')) {
    return undefined
  }

  return `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${pagePath}`
}

export const links = {
  npmCli: 'https://www.npmjs.com/package/@primitree/cli',
  npmHooks: 'https://www.npmjs.com/package/@primitree/hooks',
  playground: '/playground',
  github: 'https://github.com/marklearst/primitree',
}
