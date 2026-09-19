import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PriorityBadge, StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders a human-readable label for a multi-word status", () => {
    render(<StatusBadge status="PENDING_VERIFICATION" />);
    expect(screen.getByText("Pending Verification")).toBeInTheDocument();
  });

  it.each([
    ["ACTIVE", "Active", "text-success"],
    ["CONFIRMED", "Confirmed", "text-success"],
    ["RESOLVED", "Resolved", "text-info"],
    ["ESCALATED", "Escalated", "text-error"],
    ["UNDER_REVIEW", "Under Review", "text-warning"],
    ["OPEN", "Open", "text-warning"],
  ])("colors %s as %s", (status, label, expectedClass) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveClass(expectedClass);
  });

  it("falls back to a neutral style for an unrecognized status rather than crashing", () => {
    render(<StatusBadge status="SOME_FUTURE_STATUS" />);
    const label = screen.getByText("Some Future Status");
    expect(label).toHaveClass("text-muted-2");
  });
});

describe("PriorityBadge", () => {
  it("renders HIGH/MEDIUM/LOW with distinct colors", () => {
    const { rerender } = render(<PriorityBadge priority="HIGH" />);
    expect(screen.getByText("High")).toHaveClass("text-error");

    rerender(<PriorityBadge priority="MEDIUM" />);
    expect(screen.getByText("Medium")).toHaveClass("text-warning");

    rerender(<PriorityBadge priority="LOW" />);
    expect(screen.getByText("Low")).toHaveClass("text-muted-2");
  });
});
