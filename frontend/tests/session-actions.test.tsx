import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import App from "../src/App";
import { api } from "../src/api";
import { user } from "./fixtures";

const { signOut, notify } = vi.hoisted(() => ({ signOut: vi.fn(), notify: vi.fn() }));
vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ user, loading: false, signOut, refresh: vi.fn() }),
}));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify }) }));
vi.mock("../src/context/NotificationsContext", () => ({
  useNotifications: () => ({
    notifications: [], unread: { total: 3, messages: 2 }, hasMore: false,
  }),
}));

beforeEach(() => {
  signOut.mockReset().mockResolvedValue(undefined);
  notify.mockClear();
  vi.spyOn(api.profile, "tags").mockResolvedValue({ tags: ["art"] });
  vi.spyOn(api.discovery, "suggestions").mockResolvedValue({ profiles: [] });
});

test.each(["/", "/settings", "/onboarding", "/account/verify", "/account/reset", "/account/email", "/missing"])(
  "signed-in page %s exposes notifications, message counts, and direct logout",
  (route) => {
    render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Messages, 2 unread" })).toBeTruthy();
    const logout = screen.getAllByRole("button", { name: "Sign out" })[0];
    expect(logout).toBeTruthy();
    expect(logout?.closest(".user-menu__panel")).toBeNull();
  },
);

test("one click on the landing page revokes the session", async () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(signOut).toHaveBeenCalledTimes(1);
});

test("failed logout reports an error instead of claiming success", async () => {
  signOut.mockRejectedValue(new Error("Unable to revoke the session"));
  render(<MemoryRouter><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(notify).toHaveBeenCalledWith("Unable to revoke the session", "error");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
});
