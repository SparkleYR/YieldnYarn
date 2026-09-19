"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconBell,
  IconGavel,
  IconPackage,
  IconScan,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  ApiError,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
  type NotificationType,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const TYPE_ICON: Record<NotificationType, typeof IconBell> = {
  GRADING_COMPLETE: IconScan,
  ORDER_MATCHED: IconPackage,
  BID_RECEIVED: IconGavel,
  DISPUTE_UPDATE: IconAlertTriangle,
  SYSTEM: IconBell,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in to view notifications.");
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await listNotifications(token);
      if (!isCancelled()) setNotifications(res.results);
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : "Failed to load notifications.");
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load(() => cancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function markRead(id: number) {
    const token = getStoredTokens()?.access;
    if (!token) return;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await markNotificationRead(id, token);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to mark as read.");
    }
  }

  async function markAllRead() {
    const token = getStoredTokens()?.access;
    if (!token) return;
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await markAllNotificationsRead(token);
    } catch (err) {
      setNotifications(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to mark all as read.");
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-border-muted bg-surface p-8 text-center text-sm text-body">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-heading">Notifications</h1>
          <p className="mt-1 text-sm text-body">Updates on your requirements, orders, and account.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border-muted p-12 text-center text-sm text-body">
          No notifications yet.
        </p>
      )}

      {!loading && notifications.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-muted rounded-2xl border border-border-muted bg-surface">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type];
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={cn(
                    "flex w-full gap-3 p-5 text-left",
                    !n.is_read && "bg-brand-primary/5"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary-glow">
                    <Icon size={16} />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-heading">{n.title}</p>
                      {!n.is_read && <span className="size-2 shrink-0 rounded-full bg-brand-primary-glow" />}
                    </div>
                    <p className="mt-0.5 text-sm text-body">{n.message}</p>
                    <p className="mt-1.5 text-xs text-muted-2">
                      {new Date(n.created_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
