import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { useVariableCollections } from "../../src/hooks/useVariableCollections";
import { useVariables } from "../../src/hooks/useVariables";
import { mockVariablesResponse } from "../../tests/mocks/variables";

vi.mock("../../src/hooks/useVariables");

const mockedUseVariables = useVariables as Mock;

describe("useVariableCollections", () => {
  it("should return empty collections when useVariables has no data", () => {
    mockedUseVariables.mockReturnValue({
      data: undefined,
    });
    const { result } = renderHook(() => useVariableCollections());
    expect(result.current.collections).toEqual([]);
    expect(result.current.collectionsById).toEqual({});
  });

  it("should return collections when useVariables has data", () => {
    mockedUseVariables.mockReturnValue({
      data: mockVariablesResponse,
    });
    const { result } = renderHook(() => useVariableCollections());

    const expectedCollections = Object.values(mockVariablesResponse.meta.variableCollections);
    const expectedCollectionsById = mockVariablesResponse.meta.variableCollections;

    expect(result.current.collections).toEqual(expectedCollections);
    expect(result.current.collectionsById).toEqual(expectedCollectionsById);
  });

  it("should memoize the result and not re-calculate on re-render", () => {
    const mockData = {
      data: mockVariablesResponse,
    };
    mockedUseVariables.mockReturnValue(mockData);

    const { result, rerender } = renderHook(() => useVariableCollections());

    const initialCollections = result.current.collections;
    const initialCollectionsById = result.current.collectionsById;

    rerender();

    expect(result.current.collections).toBe(initialCollections);
    expect(result.current.collectionsById).toBe(initialCollectionsById);
  });
});
