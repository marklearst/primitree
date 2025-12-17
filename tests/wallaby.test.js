import { describe, it, expect } from "vitest";

describe("wallaby.js config", () => {
  it("should export a function that returns a valid config", async () => {
    const wallabyConfigModule = await import("../wallaby.js");
    const wallabyConfig = wallabyConfigModule.default;

    // Should be a function
    expect(typeof wallabyConfig).toBe("function");

    // Should return a config object when called
    const config = wallabyConfig({
      /* mock wallaby object */
    });

    expect(config).toBeDefined();
    expect(config.files).toBeDefined();
    expect(config.tests).toBeDefined();
    expect(config.testFramework).toBeDefined();
    expect(config.env).toBeDefined();

    // Check specific config values
    expect(Array.isArray(config.files)).toBe(true);
    expect(Array.isArray(config.tests)).toBe(true);
    expect(config.testFramework.name).toBe("vitest");
    expect(config.env.type).toBe("node");
  });
});
