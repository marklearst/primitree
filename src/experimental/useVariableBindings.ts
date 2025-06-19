// Advanced: bind variables to components (not a Figma API feature)
import { useState } from 'react'
import type { FigmaVariable } from 'types'

const useVariableBindings = () => {
  const [bindings, setBindings] = useState<Map<string, FigmaVariable>>(
    new Map()
  )
  const bindVariable = (elementId: string, variable: FigmaVariable) =>
    setBindings(new Map(bindings.set(elementId, variable)))
  const unbindVariable = (elementId: string) => {
    const newBindings = new Map(bindings)
    newBindings.delete(elementId)
    setBindings(newBindings)
  }
  return { bindings, bindVariable, unbindVariable }
}

export default useVariableBindings
