/** The CSS custom property emitCss writes for a token path. */
export const cssVarOf = (path: string) => `--${path.split('.').join('-')}`
