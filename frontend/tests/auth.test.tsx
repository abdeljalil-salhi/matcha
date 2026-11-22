import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { api, ApiError } from "../src/api";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { user } from "./fixtures";

test("logout failure keeps the authenticated state until server revocation succeeds", async () => {
  vi.spyOn(api.profile, "me").mockResolvedValue(user);
  const logout = vi.spyOn(api.auth, "logout").mockRejectedValue(new Error("Offline"));
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.user?.id).toBe(user.id));
  await act(async () => {
    await expect(result.current.signOut()).rejects.toThrow("Offline");
  });
  expect(result.current.user?.id).toBe(user.id);
  logout.mockResolvedValue(undefined);
  await act(async () => result.current.signOut());
  expect(result.current.user).toBeNull();
});

test("logout treats an already-expired session as signed out", async () => {
  vi.spyOn(api.profile, "me").mockResolvedValue(user);
  vi.spyOn(api.auth, "logout").mockRejectedValue(new ApiError(401, "Session expired"));
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.user?.id).toBe(user.id));
  await act(async () => result.current.signOut());
  expect(result.current.user).toBeNull();
});
