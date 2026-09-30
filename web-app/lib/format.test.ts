import { describe, expect, it } from "vitest";

import { formatQty, formatRupees, formatRupeesShort } from "./format";

describe("format", () => {
  it("drops meaningless decimals and groups Indian-style", () => {
    expect(formatQty("1200.00")).toBe("1,200");
    expect(formatQty("12.50")).toBe("12.5");
    expect(formatQty("150000")).toBe("1,50,000");
    expect(formatQty(null)).toBe("—");
  });

  it("formats rupees", () => {
    expect(formatRupees("2450.00")).toBe("₹2,450");
    expect(formatRupees(2450.5)).toBe("₹2,450.5");
    expect(formatRupeesShort(260000)).toBe("₹2.6 L");
    expect(formatRupeesShort(12000000)).toBe("₹1.2 Cr");
  });
});
