import { describe, it, expect } from "vitest";

describe("utils barrel file", () => {
  it("should export filterVariables", async () => {
    const utilsModule = await import("../../src/utils");

    // Check that the export is present
    expect(utilsModule.filterVariables).toBeDefined();

    // Check that it's a function
    expect(typeof utilsModule.filterVariables).toBe("function");
  });
});
