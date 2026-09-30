"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError, listDisputes, updateDispute, type Dispute, type DisputeStatus } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { PageHeader, PanelHead } from "@/components/shared/page-header";
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
      <div className="state-box">
        {error}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Complaints" subtitle="Problems buyers and sellers reported on orders. Talk to both sides, then close it with a note." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Open" value={loading ? "…" : String(open.length)} hint="Need someone to handle them" />
        <StatTile
          label="Solved"
          value={loading ? "…" : String(disputes.filter((d) => d.status === "RESOLVED").length)}
          hint="Closed with a note"
        />
        <StatTile label="All complaints" value={loading ? "…" : String(disputes.length)} hint="Since the start" />
      </div>

      <div className="panel-flush">
        <PanelHead title="All complaints" />
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Order</TableHead>
              <TableHead>From</TableHead>
              <TableHead>What happened</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-border hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              disputes.map((dispute) => (
                <TableRow key={dispute.id} className="border-border">
                  <TableCell className="font-bold text-heading">#{dispute.order}</TableCell>
                  <TableCell>{dispute.raised_by_name}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{dispute.description}</TableCell>
                  <TableCell>
                    <StatusBadge status={dispute.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={dispute.status === "RESOLVED" || dispute.status === "ESCALATED"}
                      onClick={() => {
                        setActiveDispute(dispute);
                        setNotes(dispute.resolution_notes);
                      }}
                    >
                      Handle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && disputes.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-12 text-center text-base">
                  No complaints so far.
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order #{activeDispute?.order}</DialogTitle>
            <DialogDescription>{activeDispute?.description}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="resolution-notes">What was done</FieldLabel>
            <Textarea
              id="resolution-notes"
              placeholder="e.g. Seller sent the missing 2 quintal on 3 Oct."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="destructive" onClick={() => resolve("ESCALATED")} disabled={saving}>
              Send to senior staff
            </Button>
            <Button onClick={() => resolve("RESOLVED")} disabled={saving || notes.trim().length === 0}>
              Mark as solved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
