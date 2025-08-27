import { describe, it, expect } from "vitest";

describe("contexts barrel file", () => {
  it("should export FigmaVarsProvider and useFigmaTokenContext", async () => {
    const contextsModule = await import("../../src/contexts");

    // Check that all expected exports are present
    expect(contextsModule.FigmaVarsProvider).toBeDefined();
    expect(contextsModule.useFigmaTokenContext).toBeDefined();

    // Check that they are functions/components
    expect(typeof contextsModule.FigmaVarsProvider).toBe("function");
    expect(typeof contextsModule.useFigmaTokenContext).toBe("function");
  });
});
