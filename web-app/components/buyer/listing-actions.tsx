"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { ApiError, createBid, type Listing } from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

const schema = z.object({
  offered_price: z.coerce.number().positive("Must be greater than 0"),
  offered_quantity: z.coerce.number().positive("Must be greater than 0"),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function ListingActions({ listing, price }: { listing: Listing; price: number }) {
  const [bidOpen, setBidOpen] = useState(false);
  const [buying, setBuying] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { offered_price: price, offered_quantity: Number(listing.quantity) },
  });

  async function buyNow() {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("You must be signed in as a buyer to place an order.");
      return;
    }
    setBuying(true);
    try {
      await createBid(
        {
          listing: listing.id,
          offered_price: price,
          offered_quantity: Number(listing.quantity),
        },
        token
      );
      toast.success("Offer sent to the seller at the listed price.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit the offer.");
    } finally {
      setBuying(false);
    }
  }

  async function onSubmitBid(values: FormValues) {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("You must be signed in as a buyer to place a bid.");
      return;
    }
    try {
      await createBid(
        {
          listing: listing.id,
          offered_price: values.offered_price,
          offered_quantity: values.offered_quantity,
        },
        token
      );
      toast.success("Bid submitted.");
      reset();
      setBidOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit the bid.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button className="w-full" onClick={buyNow} disabled={buying}>
        {buying ? "Sending…" : "Buy Now"}
      </Button>
      <Button variant="outline" className="w-full" onClick={() => setBidOpen(true)}>
        Place a Bid
      </Button>

      <Dialog open={bidOpen} onOpenChange={setBidOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Place a bid</DialogTitle>
            <DialogDescription>
              Offer a different price or quantity than the listing. The seller can accept,
              reject, or counter.
            </DialogDescription>
          </DialogHeader>

          <form id="bid-form" onSubmit={handleSubmit(onSubmitBid)}>
            <FieldGroup>
              <Field data-invalid={!!errors.offered_price}>
                <FieldLabel htmlFor="offered_price">Offered price (₹ / {listing.unit})</FieldLabel>
                <Input id="offered_price" type="number" step="any" {...register("offered_price")} />
                <FieldError errors={errors.offered_price ? [errors.offered_price] : undefined} />
              </Field>
              <Field data-invalid={!!errors.offered_quantity}>
                <FieldLabel htmlFor="offered_quantity">Quantity ({listing.unit})</FieldLabel>
                <Input id="offered_quantity" type="number" step="any" {...register("offered_quantity")} />
                <FieldError errors={errors.offered_quantity ? [errors.offered_quantity] : undefined} />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button type="submit" form="bid-form" disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : "Submit bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
