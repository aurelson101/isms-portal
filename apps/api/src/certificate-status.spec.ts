import { describe, expect, it } from "vitest";
import { certificateStatus } from "./controllers";

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("certificateStatus", () => {
  it("reports a certificate whose validity has not started", () => {
    expect(certificateStatus(daysFromNow(1), daysFromNow(365))).toBe(
      "not-yet-valid",
    );
  });

  it("distinguishes expired, expiring and valid certificates", () => {
    expect(certificateStatus(daysFromNow(-365), daysFromNow(-1))).toBe(
      "expired",
    );
    expect(certificateStatus(daysFromNow(-1), daysFromNow(30))).toBe(
      "expiring-soon",
    );
    expect(certificateStatus(daysFromNow(-1), daysFromNow(365))).toBe("valid");
  });
});
