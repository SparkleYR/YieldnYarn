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
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/shared/page-header";
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
  const { t, intlLocale } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError(t("notifications.signIn"));
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
        setError(err instanceof ApiError ? err.message : t("notifications.loadFailed"));
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [t]);

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
      toast.error(err instanceof ApiError ? err.message : t("notifications.markFailed"));
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
      toast.error(err instanceof ApiError ? err.message : t("notifications.markAllFailed"));
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (error) {
    return (
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        action={
          unreadCount > 0 && (
            <Button variant="outline" onClick={markAllRead}>
              {t("notifications.markAll")}
            </Button>
          )
        }
      />

      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <p className="state-box border-dashed">
          {t("notifications.empty")}
        </p>
      )}

      {!loading && notifications.length > 0 && (
        <ul className="panel-flush flex flex-col divide-y divide-border">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type];
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={cn(
                    "flex w-full gap-4 p-5 text-left transition-colors hover:bg-muted/40",
                    !n.is_read && "bg-brand-primary-muted/40"
                  )}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary-muted text-brand-primary">
                    <Icon size={22} />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-bold text-heading">{n.title}</p>
                      {!n.is_read && (
                        <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs font-bold text-white">
                          {t("notifications.new")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[0.9375rem] text-body">{n.message}</p>
                    <p className="mt-2 text-sm font-medium text-muted-2">
                      {new Date(n.created_at).toLocaleString(intlLocale, {
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
