import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

//
// To resolve the "Cannot read properties of undefined (reading 'teardown')" error,
// we're explicitly calling cleanup after each test.
//
// @see https://github.com/vitest-dev/vitest/issues/1430
afterEach(() => {
  cleanup()
})
