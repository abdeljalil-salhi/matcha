import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "../src/api";
import { GoogleSignInButton } from "../src/components/auth/GoogleSignInButton";
import { LoginPage } from "../src/pages/auth/LoginPage";
import { googleErrorMessage, safeNext } from "../src/utils/googleAuth";

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ setUser: vi.fn() }),
}));
vi.mock("../src/context/ToastContext", () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

afterEach(() => vi.restoreAllMocks());

test("Google button appears only when the API reports the strategy enabled", async () => {
  vi.spyOn(api.auth, "googleStatus").mockResolvedValue({ enabled: false });
  const { unmount } = render(<GoogleSignInButton next="/chat/12" />);
  await waitFor(() => expect(api.auth.googleStatus).toHaveBeenCalled());
  expect(screen.queryByRole("link", { name: /Continue with Google/ })).toBeNull();

  unmount();
  vi.spyOn(api.auth, "googleStatus").mockResolvedValue({ enabled: true });
  render(<GoogleSignInButton next="/chat/12" />);
  const link = await screen.findByRole("link", { name: /Continue with Google/ });
  expect(link.getAttribute("href")).toBe(
    "http://localhost:8000/api/auth/google/start?next=%2Fchat%2F12",
  );
});

test("login form explains Google failures and keeps a safe return path", async () => {
  vi.spyOn(api.auth, "googleStatus").mockResolvedValue({ enabled: true });
  render(
    <MemoryRouter initialEntries={["/login?google=pending&next=%2Fdiscover"]}>
      <LoginPage />
    </MemoryRouter>,
  );
  expect(await screen.findByText(/Verify your email address first/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Continue with Google/ }).getAttribute("href")).toBe(
    "http://localhost:8000/api/auth/google/start?next=%2Fdiscover",
  );
});

test("error codes and return paths are validated", () => {
  expect(googleErrorMessage("denied")).toMatch(/cancelled/);
  expect(googleErrorMessage("unknown")).toBeTruthy();
  expect(googleErrorMessage(null)).toBeNull();
  expect(safeNext("/discover")).toBe("/discover");
  expect(safeNext("https://evil.example")).toBeNull();
  expect(safeNext("//evil.example")).toBeNull();
});
