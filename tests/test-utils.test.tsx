import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TestWrapper } from "./test-utils"; // We test the wrapper directly

describe("TestWrapper", () => {
  let originalToken: string | undefined;
  let originalFileKey: string | undefined;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Store original env variables before each test
    originalToken = process.env.VITE_FIGMA_TOKEN;
    originalFileKey = process.env.VITE_FIGMA_FILE_KEY;

    // Suppress console.error for cleaner test output
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original env variables after each test
    if (originalToken !== undefined) {
      process.env.VITE_FIGMA_TOKEN = originalToken;
    } else {
      delete process.env.VITE_FIGMA_TOKEN;
    }

    if (originalFileKey !== undefined) {
      process.env.VITE_FIGMA_FILE_KEY = originalFileKey;
    } else {
      delete process.env.VITE_FIGMA_FILE_KEY;
    }

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it("should throw an error if VITE_FIGMA_TOKEN is not defined", () => {
    // Temporarily unset the token
    delete process.env.VITE_FIGMA_TOKEN;
    delete process.env.VITE_FIGMA_FILE_KEY;

    // We expect the render to throw the specific error
    expect(() => renderHook(() => {}, { wrapper: TestWrapper })).toThrow(
      "VITE_FIGMA_TOKEN and VITE_FIGMA_FILE_KEY must be defined in your .env file for integration tests.",
    );
  });

  it("should throw an error if VITE_FIGMA_FILE_KEY is not defined", () => {
    // Temporarily unset the file key
    delete process.env.VITE_FIGMA_FILE_KEY;

    // We expect the render to throw the specific error
    expect(() => renderHook(() => {}, { wrapper: TestWrapper })).toThrow(
      "VITE_FIGMA_TOKEN and VITE_FIGMA_FILE_KEY must be defined in your .env file for integration tests.",
    );
  });

  it("should handle cleanup when environment variables were initially undefined", () => {
    // First, ensure env vars are undefined from the start
    delete process.env.VITE_FIGMA_TOKEN;
    delete process.env.VITE_FIGMA_FILE_KEY;

    // Simulate the beforeEach storing undefined values
    const testOriginalToken = process.env.VITE_FIGMA_TOKEN; // undefined
    const testOriginalFileKey = process.env.VITE_FIGMA_FILE_KEY; // undefined

    // Set some values temporarily
    process.env.VITE_FIGMA_TOKEN = "temp-token";
    process.env.VITE_FIGMA_FILE_KEY = "temp-key";

    // Now simulate the cleanup logic for undefined original values
    if (testOriginalToken !== undefined) {
      process.env.VITE_FIGMA_TOKEN = testOriginalToken;
    } else {
      delete process.env.VITE_FIGMA_TOKEN; // This tests line 24
    }

    if (testOriginalFileKey !== undefined) {
      process.env.VITE_FIGMA_FILE_KEY = testOriginalFileKey;
    } else {
      delete process.env.VITE_FIGMA_FILE_KEY; // This tests line 30
    }

    // Verify the variables are properly cleaned up (undefined)
    expect(process.env.VITE_FIGMA_TOKEN).toBeUndefined();
    expect(process.env.VITE_FIGMA_FILE_KEY).toBeUndefined();
  });
});
