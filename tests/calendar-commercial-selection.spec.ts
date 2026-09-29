import { describe, expect, it } from "./_harness.js";
import { commercialSelectionIssue } from "../client/src/components/calendar-commercial-selection.js";

const bucket = { id: "configured-bucket", label: "Fixed-price work", isActive: true };

describe("calendar suggestion commercial selection", () => {
  it("blocks entry creation until a required project's bucket is selected", () => {
    expect(commercialSelectionIssue({ required: true, buckets: [bucket] }, undefined)).toMatch(/Select a work classification/);
    expect(commercialSelectionIssue({ required: true, buckets: [bucket] }, bucket.id)).toBeNull();
  });

  it("allows no bucket on projects where buckets are optional", () => {
    expect(commercialSelectionIssue({ required: false, buckets: [] }, undefined)).toBeNull();
  });

  it("blocks stale or inactive bucket selections after changing projects", () => {
    expect(commercialSelectionIssue({ required: true, buckets: [{ ...bucket, isActive: false }] }, bucket.id)).toMatch(/no longer active/);
    expect(commercialSelectionIssue({ required: false, buckets: [bucket] }, "different-project-bucket")).toMatch(/no longer active/);
  });

  it("does not submit while classifications have not loaded", () => {
    expect(commercialSelectionIssue(undefined, undefined)).toMatch(/still loading/);
  });
});