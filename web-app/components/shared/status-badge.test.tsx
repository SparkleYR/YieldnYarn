import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PriorityBadge, StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("shows a plain-language label instead of the status code", () => {
    render(<StatusBadge status="PENDING_VERIFICATION" />);
    expect(screen.getByText("Quality check")).toBeInTheDocument();
  });

  it.each([
    ["ACTIVE", "For sale", "text-success"],
    ["CONFIRMED", "Confirmed", "text-success"],
    ["RESOLVED", "Solved", "text-info"],
    ["ESCALATED", "Sent to senior staff", "text-error"],
    ["UNDER_REVIEW", "Being looked into", "text-warning"],
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
