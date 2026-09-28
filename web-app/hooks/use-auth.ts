"use client";

import { useEffect, useState } from "react";

import type { User } from "@/lib/api";
import { getStoredUser, logout } from "@/lib/auth";

/**
 * Reads the signed-in user from localStorage and stays in sync across tabs
 * and after login()/logout() calls in this tab.
 *
 * `user` is `undefined` until the client has hydrated and checked storage
 * (always true on the server), then `null` (signed out) or a `User`.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    sync();
    window.addEventListener("msme-auth-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("msme-auth-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { user, logout };
}
