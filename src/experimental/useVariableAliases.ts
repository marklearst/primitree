// Advanced: manage variable aliases (not a Figma API feature)
import { useState } from 'react'
import type { FigmaVariable } from '../types'

const useVariableAliases = () => {
  const [aliases, setAliases] = useState<{ [alias: string]: FigmaVariable }>({})
  const setAlias = (alias: string, variable: FigmaVariable) =>
    setAliases((prev) => ({ ...prev, [alias]: variable }))
  const removeAlias = (alias: string) => {
    const newAliases = { ...aliases }
    delete newAliases[alias]
    setAliases(newAliases)
  }
  return { aliases, setAlias, removeAlias }
}

export default useVariableAliases
