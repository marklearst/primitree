import { describe, it, expect } from "vitest";

describe("hooks barrel file", () => {
  it("should export all hooks", async () => {
    const hooksModule = await import("../../src/hooks");

    // Check that all expected exports are present
    expect(hooksModule.useVariables).toBeDefined();
    expect(hooksModule.useVariableCollections).toBeDefined();
    expect(hooksModule.useVariableModes).toBeDefined();
    expect(hooksModule.useFigmaToken).toBeDefined();
    expect(hooksModule.useCreateVariable).toBeDefined();
    expect(hooksModule.useUpdateVariable).toBeDefined();
    expect(hooksModule.useDeleteVariable).toBeDefined();
    expect(hooksModule.useBulkUpdateVariables).toBeDefined();

    // Check that they are functions
    expect(typeof hooksModule.useVariables).toBe("function");
    expect(typeof hooksModule.useVariableCollections).toBe("function");
    expect(typeof hooksModule.useVariableModes).toBe("function");
    expect(typeof hooksModule.useFigmaToken).toBe("function");
    expect(typeof hooksModule.useCreateVariable).toBe("function");
    expect(typeof hooksModule.useUpdateVariable).toBe("function");
    expect(typeof hooksModule.useDeleteVariable).toBe("function");
    expect(typeof hooksModule.useBulkUpdateVariables).toBe("function");
  });
});
