import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { LandingPage } from "../src/pages/LandingPage";

const auth: { user: { id: number } | null } = { user: null };
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../src/components/layout/SessionActions", () => ({ SessionActions: () => <div /> }));

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

test("landing keeps the existing header and footer", () => {
  auth.user = null;
  renderLanding();
  expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Get started" })).toBeTruthy();
  expect(screen.getByText(/© \d{4} Matcha/)).toBeTruthy();
  expect(screen.getByText("A quieter way to meet people nearby.")).toBeTruthy();
});

test("hero matches the botanical reference copy and trust row", () => {
  auth.user = null;
  renderLanding();
  expect(screen.getByRole("heading", { level: 1, name: /Meet people who feel\s*like your kind of people/ })).toBeTruthy();
  expect(screen.getByText("Dating, with more intention")).toBeTruthy();
  for (const label of ["People nearby", "Shared interests", "Privacy by design"]) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  expect(screen.queryByRole("link", { name: "See how Matcha works" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "Explore profiles" })[0]?.getAttribute("href")).toBe("/register");
});

test("why-matcha cards and closing banner follow the reference", () => {
  auth.user = null;
  renderLanding();
  expect(screen.getByRole("heading", { level: 2, name: "A calmer, more thoughtful way to date." })).toBeTruthy();
  for (const title of ["Discover with intention", "Your privacy, respected", "Better conversations"]) {
    expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
  }
  expect(screen.getByRole("heading", { level: 2, name: "Find thoughtful people near you." })).toBeTruthy();
  expect(screen.getByText("Create a profile and discover compatible people in your area.")).toBeTruthy();
});

test("signed-in visitors keep session actions and explore links", () => {
  auth.user = { id: 7 };
  renderLanding();
  expect(screen.getByRole("link", { name: "Open Matcha" })).toBeTruthy();
  for (const link of screen.getAllByRole("link", { name: "Explore profiles" })) {
    expect(link.getAttribute("href")).toBe("/discover");
  }
});
