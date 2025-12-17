import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FigmaVarsProvider } from "../src/contexts/FigmaVarsProvider";
import { useFigmaTokenContext } from "../src/contexts/useFigmaTokenContext";

const TestComponent = () => {
  const { token, fileKey } = useFigmaTokenContext();
  return (
    <div>
      <p>Token: {token}</p>
      <p>File Key: {fileKey}</p>
    </div>
  );
};

describe("FigmaVarsProvider", () => {
  it("provides token and fileKey to children", () => {
    const testToken = "test-token";
    const testFileKey = "test-file-key";

    render(
      <FigmaVarsProvider token={testToken} fileKey={testFileKey}>
        <TestComponent />
      </FigmaVarsProvider>,
    );

    expect(screen.getByText(`Token: ${testToken}`)).toBeInTheDocument();
    expect(screen.getByText(`File Key: ${testFileKey}`)).toBeInTheDocument();
  });

  it("throws an error if useFigmaTokenContext is used outside of a provider", () => {
    // Suppress console.error for this test because we expect an error
    const originalError = console.error;
    console.error = vi.fn();

    // We need a function that will throw when called, so we wrap the render in it.
    const renderWithoutProvider = () => render(<TestComponent />);

    expect(renderWithoutProvider).toThrow(
      "useFigmaTokenContext must be used within a FigmaVarsProvider",
    );

    // Restore original console.error
    console.error = originalError;
  });
});
