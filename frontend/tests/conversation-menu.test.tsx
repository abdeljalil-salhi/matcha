import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { api } from "../src/api";
import { ConversationMenu } from "../src/pages/chat/ConversationMenu";

vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify: vi.fn() }) }));

function openMenu() {
  const onBlocked = vi.fn();
  render(<MemoryRouter><ConversationMenu userId={2} name="Lina Benali" onBlocked={onBlocked} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
  return onBlocked;
}

test("blocking requires confirmation and refreshes the inbox after success", async () => {
  const block = vi.spyOn(api.relationships, "block").mockResolvedValue(undefined);
  const onBlocked = openMenu();
  expect(block).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Block user" }));
  await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
  expect(block).toHaveBeenCalledWith(2);
});

test("canceling or failing to block preserves the conversation", async () => {
  const block = vi.spyOn(api.relationships, "block").mockRejectedValue(new Error("Offline"));
  const onBlocked = openMenu();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(block).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Block user" }));
  fireEvent.click(screen.getByRole("button", { name: "Block user" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(false));
  expect(onBlocked).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
});
