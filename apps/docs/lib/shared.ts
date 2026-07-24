export const docsRoute = '/docs'
export const docsContentRoute = '/llms.mdx/docs'

export const gitConfig = {
  user: 'marklearst',
  repo: 'figmavars',
  branch: 'main',
}

export function getDocsGithubUrl(pagePath: string) {
  if (pagePath === 'api/index.mdx' || pagePath.startsWith('api/')) {
    return undefined
  }

  return `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${pagePath}`
}

export const links = {
  npmCli: 'https://www.npmjs.com/package/@figmavars/cli',
  npmHooks: 'https://www.npmjs.com/package/@figmavars/hooks',
  playground: '/playground',
  github: 'https://github.com/marklearst/figmavars',
}
