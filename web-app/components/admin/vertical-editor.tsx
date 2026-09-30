"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  IconArrowLeft,
  IconArrowDown,
  IconArrowUp,
  IconEye,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import {
  ApiError,
  updateGradingSchema,
  updatePricingRule,
  type GradingAttribute,
  type GradingSchema,
  type PricingRule,
  type PricingRuleGradeAdjustment,
  type PricingRuleQuantityTier,
  type Vertical,
} from "@/lib/api";
import { getStoredTokens } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function reorder<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// --- UI-local editable shapes -----------------------------------------------
// The editor works in percentages (more legible for admins editing a table)
// while backend-fastapi/pricing/service.py reads multipliers — see the
// to/from converters below. `_key` is a client-only React list key, stripped
// before persisting.

type EditableAttribute = GradingAttribute & { _key: string };

interface EditableGradeAdjustment {
  _key: string;
  grade: string;
  adjustment_pct: number; // e.g. 4 means "+4%" -> multiplier 1.04
}

interface EditableQuantityTier {
  _key: string;
  min_qty: number;
  discount_pct: number; // e.g. 1.5 means "-1.5%" -> multiplier 0.985
}

function multiplierToAdjustmentPct(multiplier: number): number {
  return Math.round((multiplier - 1) * 1000) / 10;
}

function adjustmentPctToMultiplier(pct: number): number {
  return 1 + pct / 100;
}

function multiplierToDiscountPct(multiplier: number): number {
  return Math.round((1 - multiplier) * 1000) / 10;
}

function discountPctToMultiplier(pct: number): number {
  return 1 - pct / 100;
}

function keyed(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function toEditableAdjustments(
  table: PricingRuleGradeAdjustment[]
): EditableGradeAdjustment[] {
  return table.map((row) => ({
    _key: keyed(),
    grade: row.grade,
    adjustment_pct: multiplierToAdjustmentPct(row.multiplier),
  }));
}

function toEditableTiers(table: PricingRuleQuantityTier[]): EditableQuantityTier[] {
  return table.map((row) => ({
    _key: keyed(),
    min_qty: row.min_quantity,
    discount_pct: multiplierToDiscountPct(row.multiplier),
  }));
}

/**
 * Visual JSONB schema editor for a vertical's grading attributes and pricing
 * rules — no raw JSON, per the plan. "Save changes" persists via
 * PUT /api/config/verticals/{id}/grading-schema/ and .../pricing-rules/.
 */
export function VerticalEditor({
  vertical,
  gradingSchema,
  pricingRule,
}: {
  vertical: Vertical;
  gradingSchema: GradingSchema;
  pricingRule: PricingRule;
}) {
  const [attributes, setAttributes] = useState<EditableAttribute[]>(
    gradingSchema.attributes.map((a) => ({ ...a, _key: keyed() }))
  );
  const [gradeAdjustments, setGradeAdjustments] = useState<EditableGradeAdjustment[]>(
    toEditableAdjustments(pricingRule.rules?.grade_adjustment_table ?? [])
  );
  const [quantityTiers, setQuantityTiers] = useState<EditableQuantityTier[]>(
    toEditableTiers(pricingRule.rules?.quantity_tier_table ?? [])
  );
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const weightTotal = attributes.reduce((sum, a) => sum + a.weight, 0);

  function updateAttribute(index: number, patch: Partial<EditableAttribute>) {
    setAttributes((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function addAttribute() {
    setAttributes((prev) => [
      ...prev,
      {
        _key: keyed(),
        name: "New attribute",
        type: "numeric",
        gradeable_by_ml: false,
        weight: 0,
        range: "",
      },
    ]);
  }

  function updateAdjustment(index: number, patch: Partial<EditableGradeAdjustment>) {
    setGradeAdjustments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function updateTier(index: number, patch: Partial<EditableQuantityTier>) {
    setQuantityTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  async function handleSave() {
    const token = getStoredTokens()?.access;
    if (!token) {
      toast.error("You must be signed in as an admin to save changes.");
      return;
    }
    setSaving(true);
    try {
      const attributesForApi: GradingAttribute[] = attributes.map((attr) => ({
        name: attr.name,
        type: attr.type,
        gradeable_by_ml: attr.gradeable_by_ml,
        weight: attr.weight,
        range: attr.range,
      }));
      const rulesForApi = {
        grade_adjustment_table: gradeAdjustments.map((a) => ({
          grade: a.grade,
          multiplier: adjustmentPctToMultiplier(a.adjustment_pct),
        })),
        quantity_tier_table: quantityTiers.map((t) => ({
          min_quantity: t.min_qty,
          multiplier: discountPctToMultiplier(t.discount_pct),
        })),
      };

      await Promise.all([
        updateGradingSchema(vertical.id, attributesForApi, token),
        updatePricingRule(vertical.id, rulesForApi, token),
      ]);
      toast.success("Vertical configuration saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <Link href="/admin/verticals" className="flex w-fit items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline">
        <IconArrowLeft size={18} />
        All categories
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{vertical.name}</h1>
          <p className="page-subtitle">Sold by the {vertical.unit_of_measure}. Change what is checked and how price follows quality.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant={preview ? "secondary" : "outline"} onClick={() => setPreview((p) => !p)}>
            <IconEye />
            {preview ? "Editing" : "Preview"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {preview ? (
        <VerticalPreview
          vertical={vertical}
          attributes={attributes}
          gradeAdjustments={gradeAdjustments}
        />
      ) : (
        <Tabs defaultValue="attributes">
          <TabsList>
            <TabsTrigger value="attributes">Quality checks</TabsTrigger>
            <TabsTrigger value="pricing">Price rules</TabsTrigger>
          </TabsList>

          <TabsContent value="attributes" className="mt-2 flex flex-col gap-3">
            <div className="panel-flush">
              <div className="grid grid-cols-[1fr_auto_auto_auto_1fr_auto] gap-3 border-b border-border bg-muted/60 px-5 py-3 text-sm font-bold text-muted-2">
                <span>Check</span>
                <span>Kind</span>
                <span>From photos</span>
                <span>Importance</span>
                <span>Allowed range</span>
                <span className="sr-only">Actions</span>
              </div>
              {attributes.map((attr, i) => (
                <AttributeRow
                  key={attr._key}
                  attribute={attr}
                  onChange={(patch) => updateAttribute(i, patch)}
                  onRemove={() => setAttributes((prev) => prev.filter((_, j) => j !== i))}
                  onMove={(dir) => setAttributes((prev) => reorder(prev, i, dir))}
                  isFirst={i === 0}
                  isLast={i === attributes.length - 1}
                />
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span className={cn("text-sm font-semibold", weightTotal === 1 ? "text-muted-2" : "text-warning")}>
                  Importance adds up to {Math.round(weightTotal * 100)}%{weightTotal !== 1 && " — it should be 100%"}
                </span>
                <Button variant="outline" size="sm" onClick={addAttribute}>
                  <IconPlus />
                  Add a check
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="panel">
              <h3 className="panel-title">Price change by quality</h3>
              <p className="panel-subtitle">
                How much each grade adds to or takes off the market price, in %.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {gradeAdjustments.map((adj, i) => (
                  <div key={adj._key} className="flex items-center gap-2">
                    <Input
                      value={adj.grade}
                      onChange={(e) => updateAdjustment(i, { grade: e.target.value })}
                      className="max-w-40"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={adj.adjustment_pct}
                        onChange={(e) => updateAdjustment(i, { adjustment_pct: Number(e.target.value) })}
                        className="w-20"
                      />
                      <span className="text-sm font-semibold text-muted-2">%</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-2 hover:text-error"
                      onClick={() => setGradeAdjustments((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <IconTrash size={18} />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() =>
                    setGradeAdjustments((prev) => [
                      ...prev,
                      { _key: keyed(), grade: "New grade", adjustment_pct: 0 },
                    ])
                  }
                >
                  <IconPlus />
                  Add grade
                </Button>
              </div>
            </div>

            <div className="panel">
              <h3 className="panel-title">Bulk discounts</h3>
              <p className="panel-subtitle">A lower price per unit for bigger orders.</p>
              <div className="mt-4 flex flex-col gap-3">
                {quantityTiers.map((tier, i) => (
                  <div key={tier._key} className="flex items-center gap-2 text-sm font-medium text-body">
                    <span>At least</span>
                    <Input
                      type="number"
                      value={tier.min_qty}
                      onChange={(e) => updateTier(i, { min_qty: Number(e.target.value) })}
                      className="w-24"
                    />
                    <span>units →</span>
                    <Input
                      type="number"
                      value={tier.discount_pct}
                      onChange={(e) => updateTier(i, { discount_pct: Number(e.target.value) })}
                      className="w-20"
                    />
                    <span>% off</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-2 hover:text-error"
                      onClick={() => setQuantityTiers((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <IconTrash size={18} />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() =>
                    setQuantityTiers((prev) => [
                      ...prev,
                      { _key: keyed(), min_qty: 0, discount_pct: 0 },
                    ])
                  }
                >
                  <IconPlus />
                  Add tier
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AttributeRow({
  attribute,
  onChange,
  onRemove,
  onMove,
  isFirst,
  isLast,
}: {
  attribute: EditableAttribute;
  onChange: (patch: Partial<EditableAttribute>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const switchId = useId();

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_1fr_auto] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
      <Input value={attribute.name} onChange={(e) => onChange({ name: e.target.value })} />

      <Select
        value={attribute.type}
        onValueChange={(v) => onChange({ type: v as EditableAttribute["type"] })}
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="numeric">Number</SelectItem>
          <SelectItem value="categorical">Choice</SelectItem>
          <SelectItem value="boolean">Yes / no</SelectItem>
        </SelectContent>
      </Select>

      <Switch
        id={switchId}
        checked={attribute.gradeable_by_ml}
        onCheckedChange={(checked) => onChange({ gradeable_by_ml: checked })}
      />

      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={100}
          value={Math.round(attribute.weight * 100)}
          onChange={(e) => onChange({ weight: Number(e.target.value) / 100 })}
          className="w-20"
        />
        <span className="text-sm font-semibold text-muted-2">%</span>
      </div>

      <Input
        value={attribute.range}
        onChange={(e) => onChange({ range: e.target.value })}
        placeholder="e.g. 0–100%"
      />

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" disabled={isFirst} onClick={() => onMove(-1)}>
          <IconArrowUp size={18} />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={isLast} onClick={() => onMove(1)}>
          <IconArrowDown size={18} />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-muted-2 hover:text-error" onClick={onRemove}>
          <IconTrash size={18} />
        </Button>
      </div>
    </div>
  );
}

function VerticalPreview({
  vertical,
  attributes,
  gradeAdjustments,
}: {
  vertical: Vertical;
  attributes: EditableAttribute[];
  gradeAdjustments: EditableGradeAdjustment[];
}) {
  const basePrice = 2500;
  const topGrade = gradeAdjustments[0];

  return (
    <div className="panel">
      <p className="text-sm font-semibold text-muted-2">How a listing will look</p>
      <div className="mt-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-heading">
          Sample {vertical.name} commodity
        </h3>
        {topGrade && (
          <span className="rounded-full bg-brand-primary-muted px-2.5 py-1 text-xs font-bold text-brand-primary-hover">
            {topGrade.grade}
          </span>
        )}
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-border">
        {attributes.map((attr) => (
          <li key={attr._key} className="flex items-center justify-between py-3 text-[0.9375rem]">
            <span className="flex items-center gap-2 text-body">
              {attr.name || "Untitled attribute"}
              {attr.gradeable_by_ml && (
                <span className="rounded-full bg-brand-primary-muted px-2 py-0.5 text-xs font-bold text-brand-primary-hover">
                  From photos
                </span>
              )}
            </span>
            <span className="text-sm text-muted-2">{attr.range || "—"}</span>
          </li>
        ))}
      </ul>
      {topGrade && (
        <p className="mt-4 border-t border-border pt-3 text-sm text-body">
          Base price ₹{basePrice.toLocaleString("en-IN")} → adjusted{" "}
          <span className="font-semibold text-heading">
            ₹{Math.round(basePrice * (1 + topGrade.adjustment_pct / 100)).toLocaleString("en-IN")}
          </span>{" "}
          at {topGrade.grade}
        </p>
      )}
    </div>
  );
}
