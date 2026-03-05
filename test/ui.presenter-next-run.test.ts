import { describe, expect, it } from "vitest";
import { formatNextRun } from "../ui/src/ui/presenter.ts";

describe("formatNextRun", () => {
  it("returns n/a for nullish values", () => {
    expect(formatNextRun(null)).toBe("n/a");
    expect(formatNextRun(undefined)).toBe("n/a");
  });

  it("includes weekday and relative time", () => {
    const ts = Date.UTC(2026, 1, 23, 15, 0, 0);
    const out = formatNextRun(ts);
    // Accept English (e.g. "Mon, ") or Chinese (e.g. "周一, ") weekday formats
    expect(out).toMatch(/^(?:[A-Za-z]{3}|[\u4e00-\u9fff]+|[^\s,]+), /);
    expect(out).toContain("(");
    expect(out).toContain(")");
  });
});
