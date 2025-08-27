import { renderHook, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { FigmaVarsProvider } from "../../src/contexts/FigmaVarsProvider";
import { useVariables } from "../../src/hooks/useVariables";
import { mockVariablesResponse } from "../mocks/variables";
import type { ReactNode } from "react";

// Mock the useSWR hook
vi.mock("swr");

const mockedUseSWR = useSWR as Mock;

const wrapper = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider token="test-token" fileKey="test-key">
    {children}
  </FigmaVarsProvider>
);

const wrapperNoToken = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider token={null} fileKey="test-key">
    {children}
  </FigmaVarsProvider>
);

const wrapperNoFileKey = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider token="test-token" fileKey={null}>
    {children}
  </FigmaVarsProvider>
);

const wrapperWithFallbackFile = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token="test-token"
    fileKey="test-key"
    fallbackFile={mockVariablesResponse}>
    {children}
  </FigmaVarsProvider>
);

const wrapperWithFallbackFileString = ({ children }: { children: ReactNode }) => (
  <FigmaVarsProvider
    token="test-token"
    fileKey="test-key"
    fallbackFile={JSON.stringify(mockVariablesResponse)}>
    {children}
  </FigmaVarsProvider>
);

describe("useVariables", () => {
  it("should return loading state initially", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
    });

    const { result } = renderHook(() => useVariables(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isValidating).toBe(false);
  });

  it("should return variables on successful fetch", async () => {
    mockedUseSWR.mockReturnValue({
      data: mockVariablesResponse,
      error: undefined,
      isLoading: false,
      isValidating: false,
    });

    const { result } = renderHook(() => useVariables(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual(mockVariablesResponse);
      expect(result.current.error).toBeUndefined();
      expect(result.current.isValidating).toBe(false);
    });
  });

  it("should return an error when fetch fails", async () => {
    const error = new Error("Failed to fetch");
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: error,
      isLoading: false,
      isValidating: false,
    });

    const { result } = renderHook(() => useVariables(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBe(error);
      expect(result.current.isValidating).toBe(false);
    });
  });

  it("should return isValidating true when revalidating", () => {
    mockedUseSWR.mockReturnValue({
      data: mockVariablesResponse,
      error: undefined,
      isLoading: false,
      isValidating: true,
    });

    const { result } = renderHook(() => useVariables(), { wrapper });

    expect(result.current.isValidating).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("should not call useSWR when token is missing", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
    });

    renderHook(() => useVariables(), { wrapper: wrapperNoToken });

    expect(mockedUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("should not call useSWR when fileKey is missing", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
    });

    renderHook(() => useVariables(), { wrapper: wrapperNoFileKey });

    expect(mockedUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("should use fallbackFile when provided as object", () => {
    // Mock the custom fetcher behavior for fallbackFile
    mockedUseSWR.mockImplementation((key) => {
      if (key && Array.isArray(key) && key[0] && key[1]) {
        // Simulate the custom fetcher being called and returning fallback data
        return {
          data: mockVariablesResponse,
          error: null,
          isLoading: false,
          isValidating: false,
        };
      }
      return {
        data: undefined,
        error: null,
        isLoading: false,
        isValidating: false,
      };
    });

    const { result } = renderHook(() => useVariables(), { wrapper: wrapperWithFallbackFile });

    expect(result.current.data).toEqual(mockVariablesResponse);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isValidating).toBe(false);
  });

  it("should use fallbackFile when provided as string", () => {
    // Mock the custom fetcher behavior for fallbackFile string
    mockedUseSWR.mockImplementation((key) => {
      if (key && Array.isArray(key) && key[0] && key[1]) {
        // Simulate the custom fetcher being called and returning fallback data
        return {
          data: mockVariablesResponse,
          error: null,
          isLoading: false,
          isValidating: false,
        };
      }
      return {
        data: undefined,
        error: null,
        isLoading: false,
        isValidating: false,
      };
    });

    const { result } = renderHook(() => useVariables(), { wrapper: wrapperWithFallbackFileString });

    expect(result.current.data).toEqual(mockVariablesResponse);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isValidating).toBe(false);
  });

    it("should test custom fetcher logic directly", async () => {
    // Test the actual custom fetcher logic by calling it directly
    renderHook(() => useVariables(), { wrapper: wrapperWithFallbackFile });

    // Get the custom fetcher function from the useSWR call
    const useSWRCalls = mockedUseSWR.mock.calls;
    expect(useSWRCalls.length).toBeGreaterThan(0);

    const call = useSWRCalls[0];
    expect(call).toBeDefined();
    const [key, fetcher] = call as [unknown, (url: string, token: string) => Promise<unknown>];
    expect(key).toEqual(['https://api.figma.com/v1/files/test-key/variables/local', 'test-token']);
    expect(typeof fetcher).toBe('function');

    // Call the custom fetcher directly to test the fallbackFile logic
    const resultData = await fetcher('https://api.figma.com/v1/files/test-key/variables/local', 'test-token');
    expect(resultData).toEqual(mockVariablesResponse);
  });
});
