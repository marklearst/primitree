/**
 * @packageDocumentation
 * Barrel file for all framework-agnostic types in @figma-vars/core.
 *
 * @remarks
 * Re-exports all Figma domain types (variables, collections, modes, API response
 * models) and mutation payload/result types. Published as the `@figma-vars/core/types`
 * subpath so downstream packages can re-export the exact type surface.
 */
export * from './figma'
export * from './mutations'
