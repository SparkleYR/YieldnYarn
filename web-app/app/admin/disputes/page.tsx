"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError, listDisputes, updateDispute, type Dispute, type DisputeStatus } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDispute, setActiveDispute] = useState<Dispute | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const token = getStoredTokens()?.access;
    if (!token) {
      if (!isCancelled()) {
        setError("You must be signed in as an admin to view disputes.");
        setLoading(false);
      }
      return;
    }
    if (!isCancelled()) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await listDisputes(token);
      if (!isCancelled()) setDisputes(res.results);
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof ApiError ? err.message : "Failed to load disputes.");
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

  const open = disputes.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");

  async function resolve(nextStatus: DisputeStatus) {
    if (!activeDispute) return;
    const token = getStoredTokens()?.access;
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateDispute(
        activeDispute.id,
        { status: nextStatus, resolution_notes: notes },
        token
      );
      setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      toast.success(nextStatus === "RESOLVED" ? "Dispute resolved." : "Dispute escalated.");
      setActiveDispute(null);
      setNotes("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update the dispute.");
    } finally {
      setSaving(false);
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Open disputes" value={loading ? "…" : String(open.length)} />
        <StatTile
          label="Resolved"
          value={loading ? "…" : String(disputes.filter((d) => d.status === "RESOLVED").length)}
        />
        <StatTile label="Total" value={loading ? "…" : String(disputes.length)} />
      </div>

      <div className="rounded-2xl border border-border-muted bg-surface">
        <div className="border-b border-border-muted p-5">
          <h2 className="text-sm font-semibold text-heading">Disputes</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border-muted hover:bg-transparent">
              <TableHead className="pl-5">Order</TableHead>
              <TableHead>Raised by</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-border-muted hover:bg-transparent">
                  <TableCell className="pl-5" colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              disputes.map((dispute) => (
                <TableRow key={dispute.id} className="border-border-muted">
                  <TableCell className="pl-5 font-medium text-heading">#{dispute.order}</TableCell>
                  <TableCell className="text-body">{dispute.raised_by_name}</TableCell>
                  <TableCell className="max-w-xs text-body">{dispute.description}</TableCell>
                  <TableCell>
                    <StatusBadge status={dispute.status} />
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={dispute.status === "RESOLVED" || dispute.status === "ESCALATED"}
                      onClick={() => {
                        setActiveDispute(dispute);
                        setNotes(dispute.resolution_notes);
                      }}
                    >
                      Resolve
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && disputes.length === 0 && (
              <TableRow className="border-border-muted hover:bg-transparent">
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-2">
                  No disputes.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={activeDispute !== null}
        onOpenChange={(next) => {
          if (!next) {
            setActiveDispute(null);
            setNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Order #{activeDispute?.order}</DialogTitle>
            <DialogDescription>{activeDispute?.description}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="resolution-notes">Resolution notes</FieldLabel>
            <Textarea
              id="resolution-notes"
              placeholder="Summarize how this dispute was resolved…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="destructive" onClick={() => resolve("ESCALATED")} disabled={saving}>
              Escalate
            </Button>
            <Button onClick={() => resolve("RESOLVED")} disabled={saving || notes.trim().length === 0}>
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
