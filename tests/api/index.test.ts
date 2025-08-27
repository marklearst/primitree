import { describe, it, expect } from "vitest";

describe("api barrel file", () => {
  it("should export fetcher and mutator", async () => {
    const apiModule = await import("../../src/api");

    // Check that all expected exports are present
    expect(apiModule.fetcher).toBeDefined();
    expect(apiModule.mutator).toBeDefined();

    // Check that they are functions
    expect(typeof apiModule.fetcher).toBe("function");
    expect(typeof apiModule.mutator).toBe("function");
  });
});
