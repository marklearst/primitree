import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useMutation, mutationReducer } from "../../src/hooks/useMutation";

describe("useMutation", () => {
  it("should initialize with idle state", () => {
    const mutationFn = vi.fn();
    const { result } = renderHook(() => useMutation(mutationFn));

    expect(result.current.status).toBe("idle");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should transition to loading and then success state on successful mutation", async () => {
    const mockData = { id: 1, name: "Test" };
    const mutationFn = vi.fn().mockResolvedValue(mockData);
    const { result } = renderHook(() => useMutation(mutationFn));

    let mutateResult;
    await act(async () => {
      mutateResult = await result.current.mutate({ payload: "test" });
    });

    expect(mutationFn).toHaveBeenCalledWith({ payload: "test" });
    expect(result.current.status).toBe("success");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
    expect(mutateResult).toEqual(mockData);
  });

  it("should transition to loading and then error state on failed mutation", async () => {
    const mockError = new Error("Mutation Failed");
    const mutationFn = vi.fn().mockRejectedValue(mockError);
    const { result } = renderHook(() => useMutation(mutationFn));

    let mutateResult;
    await act(async () => {
      mutateResult = await result.current.mutate({ payload: "test" });
    });

    expect(mutationFn).toHaveBeenCalledWith({ payload: "test" });
    expect(result.current.status).toBe("error");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toEqual(mockError);
    expect(result.current.data).toBeNull();
    expect(mutateResult).toBeUndefined();
  });

  it("should handle loading state correctly during mutation", async () => {
    const mutationFn = vi.fn(() => new Promise(() => {})); // Never resolves
    const { result } = renderHook(() => useMutation(mutationFn));

    act(() => {
      result.current.mutate({ payload: "test" });
    });

    expect(result.current.status).toBe("loading");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.isSuccess).toBe(false);
  });

  it("should return unchanged state for unknown action type in reducer", () => {
    const initialState = {
      status: "idle" as const,
      data: null,
      error: null,
    };

    // Test the reducer directly with an unknown action type
    const result = mutationReducer(initialState, { type: "unknown" as any });

    expect(result).toEqual(initialState);
    expect(result).toBe(initialState); // Should return the exact same object reference
  });
});
