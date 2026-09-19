import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthTokens, User } from "./api";
import { clearSession, dashboardPathForRole, getStoredTokens, getStoredUser, setSession } from "./auth";

const tokens: AuthTokens = { access: "access-token", refresh: "refresh-token" };
const user: User = {
  id: 1,
  email: "buyer@example.com",
  phone: "",
  role: "BUYER",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("session storage (lib/auth.ts)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is stored yet", () => {
    expect(getStoredTokens()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it("round-trips tokens and user through setSession/getStored*", () => {
    setSession(tokens, user);

    expect(getStoredTokens()).toEqual(tokens);
    expect(getStoredUser()).toEqual(user);
  });

  it("clearSession removes both, leaving a clean slate", () => {
    setSession(tokens, user);
    clearSession();

    expect(getStoredTokens()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it("setSession dispatches msme-auth-change so listeners (e.g. the navbar) can react", () => {
    const handler = vi.fn();
    window.addEventListener("msme-auth-change", handler);

    setSession(tokens, user);

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("msme-auth-change", handler);
  });

  it("survives corrupted JSON in storage rather than throwing", () => {
    window.localStorage.setItem("msme.auth.tokens", "{not valid json");

    expect(getStoredTokens()).toBeNull();
  });

  describe("dashboardPathForRole", () => {
    it.each([
      ["ADMIN", "/admin/dashboard"],
      ["VERIFIER", "/verifier/dashboard"],
      ["SELLER", "/buyer/dashboard"],
      ["BUYER", "/buyer/dashboard"],
    ] as const)("routes %s to %s", (role, expected) => {
      expect(dashboardPathForRole(role)).toBe(expected);
    });
  });
});
