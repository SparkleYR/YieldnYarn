"use client";

import { useEffect, useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { toast } from "sonner";

import { ApiError, listUsers, setUserActive, type AdminUser, type UserRole } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLE_FILTERS: { value: UserRole | "ALL"; label: string }[] = [
  { value: "ALL", label: "All roles" },
  { value: "SELLER", label: "Seller" },
  { value: "BUYER", label: "Buyer" },
  { value: "VERIFIER", label: "Verifier" },
  { value: "ADMIN", label: "Admin" },
];

function displayName(user: AdminUser) {
  return user.profile?.display_name || user.email;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | "ALL">("ALL");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredTokens()?.access;
      if (!token) {
        if (!cancelled) {
          setError("You must be signed in as an admin to view users.");
          setLoading(false);
        }
        return;
      }
      try {
        const { results } = await listUsers(token);
        if (!cancelled) setUsers(results);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load users.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = role === "ALL" || u.role === role;
      const matchesQuery =
        query.trim() === "" ||
        displayName(u).toLowerCase().includes(query.toLowerCase()) ||
        u.email.toLowerCase().includes(query.toLowerCase());
      return matchesRole && matchesQuery;
    });
  }, [users, role, query]);

  async function toggleActive(user: AdminUser) {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("You must be signed in as an admin to change account status.");
      return;
    }
    const nextActive = !user.is_active;
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u))
    );
    try {
      await setUserActive(user.id, nextActive, token);
      toast.success(nextActive ? "Account activated." : "Account deactivated.");
    } catch (err) {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: user.is_active } : u))
      );
      toast.error(err instanceof ApiError ? err.message : "Failed to update account status.");
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-2" />
          <Input
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as UserRole | "ALL")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-border-muted hover:bg-transparent">
              <TableHead className="pl-5">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="pr-5 text-right">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="border-border-muted hover:bg-transparent">
                  <TableCell className="pl-5" colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              filtered.map((user) => (
                <TableRow key={user.id} className="border-border-muted">
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-2.5">
                      <Avatar size="sm">
                        <AvatarFallback>{displayName(user).slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-heading">{displayName(user)}</p>
                        <p className="text-xs text-muted-2">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-body">{user.role}</TableCell>
                  <TableCell className="text-body">
                    {new Date(user.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Switch
                      checked={user.is_active}
                      onCheckedChange={() => toggleActive(user)}
                      aria-label={user.is_active ? "Deactivate account" : "Activate account"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && filtered.length === 0 && (
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-2">
                  No users match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
