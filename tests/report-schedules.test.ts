import { describe, expect, it, vi, beforeEach } from "vitest";
import { nextReportRun, reportPeriod, reportScheduleConfigSchema, type ReportScheduleConfig } from "../shared/report-scheduling";
const provider = vi.hoisted(() => ({ send: vi.fn(), connect: vi.fn() }));
vi.mock("../server/services/sendgrid-client", () => ({ getUncachableSendGridClient: provider.connect }));
// No database connection is made by calendar/completion tests.
vi.mock("../server/db", () => ({ db: {} }));
import { EmailNotificationService, EmailDeliveryError, escapeReportEmail } from "../server/services/email-notification";
import { completedInPeriod, deliverableInReport } from "../server/services/status-report-generation";

const config: ReportScheduleConfig = {
  cadence: "weekly", day: 1, time: "08:00", timezone: "America/New_York",
  period: "previous_week", style: "executive_brief", recipientIds: ["user"], reviewerId: "reviewer", autoSend: false, pmContext: "",
};
describe("report schedule calendar and periods", () => {
  it("defaults to review, rejects malformed configuration and deduplicates recipients", () => {
    const { autoSend, ...without } = config;
    expect(reportScheduleConfigSchema.parse({ ...without, recipientIds: ["a", "a"] })).toMatchObject({ autoSend: false, recipientIds: ["a"] });
    for (const change of [{ timezone: "not/a/zone" }, { day: 7 }, { time: "25:00" }, { recipientIds: [] }, { tenantId: "spoof" }]) {
      expect(reportScheduleConfigSchema.safeParse({ ...config, ...change }).success).toBe(false);
    }
  });
  it("keeps weekly local time across spring DST", () => {
    expect(nextReportRun(config, new Date("2026-03-02T13:00:00Z")).toISOString()).toBe("2026-03-09T12:00:00.000Z");
  });
  it("keeps weekly local time across autumn DST", () => {
    expect(nextReportRun(config, new Date("2026-10-26T12:00:00Z")).toISOString()).toBe("2026-11-02T13:00:00.000Z");
  });
  it("skips nonexistent local times", () => {
    expect(nextReportRun({ ...config, day: 0, time: "02:30" }, new Date("2026-03-07T00:00:00Z")).toISOString()).toBe("2026-03-15T06:30:00.000Z");
  });
  it("runs only once in a repeated local hour", () => {
    const folded = { ...config, day: 0, time: "01:30" };
    expect(nextReportRun(folded, new Date("2026-10-31T00:00:00Z")).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(nextReportRun(folded, new Date("2026-11-01T05:30:00Z")).toISOString()).toBe("2026-11-08T06:30:00.000Z");
    for (const after of ["2026-11-01T05:45:00Z", "2026-11-01T06:00:00Z", "2026-11-01T06:15:00Z", "2026-11-01T06:29:00Z"]) {
      expect(nextReportRun(folded, new Date(after)).toISOString()).toBe("2026-11-08T06:30:00.000Z");
    }
  });
  it("handles fractional timezones and short months", () => {
    expect(nextReportRun({ ...config, timezone: "Asia/Kathmandu" }, new Date("2026-11-22T00:00:00Z")).toISOString()).toBe("2026-11-23T02:15:00.000Z");
    expect(nextReportRun({ ...config, cadence: "monthly", day: 31, timezone: "UTC" }, new Date("2028-02-01T00:00:00Z")).toISOString()).toBe("2028-02-29T08:00:00.000Z");
  });
  it("uses the schedule timezone and original occurrence for closed periods", () => {
    expect(reportPeriod(config, new Date("2026-11-23T00:30:00Z"))).toEqual({ periodStart: "2026-11-09", periodEnd: "2026-11-15" });
    expect(reportPeriod({ ...config, period: "previous_month" }, new Date("2028-03-01T13:00:00Z"))).toEqual({ periodStart: "2028-02-01", periodEnd: "2028-02-29" });
    expect(reportPeriod({ ...config, period: "previous_month" }, new Date("2027-01-04T13:00:00Z"))).toEqual({ periodStart: "2026-12-01", periodEnd: "2026-12-31" });
  });
  it("requires explicit completion dates bounded on both ends", () => {
    const check = (completedDate?: string | null, status = "completed") => completedInPeriod({ status, completedDate }, "2026-11-16", "2026-11-22");
    expect(check()).toBe(false); expect(check(null)).toBe(false);
    expect(check("2026-11-15")).toBe(false); expect(check("2026-11-23")).toBe(false);
    expect(check("2026-11-16")).toBe(true); expect(check("2026-11-22")).toBe(true);
    expect(check("2026-11-20", "open")).toBe(false);
  });
  it("bounds accepted deliverables by explicit delivery date and excludes rejected work", () => {
    const include = (status: string, deliveredDate?: string | null) => deliverableInReport({ status, deliveredDate }, "2026-11-16", "2026-11-22");
    expect(include("accepted", "2026-11-15")).toBe(false);
    expect(include("accepted", "2026-11-16")).toBe(true);
    expect(include("accepted", "2026-11-20")).toBe(true);
    expect(include("accepted", "2026-11-22")).toBe(true);
    expect(include("accepted", "2026-11-23")).toBe(false);
    expect(include("accepted")).toBe(false);
    expect(include("accepted", null)).toBe(false);
    for (const date of [undefined, "2026-11-15", "2026-11-20", "2026-11-23"]) expect(include("rejected", date)).toBe(false);
    for (const status of ["not-started", "in-progress", "in-review"]) expect(include(status)).toBe(true);
    expect(include("completed", "2026-11-20")).toBe(false);
  });
});
describe("strict mocked email delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    provider.connect.mockResolvedValue({ client: { send: provider.send }, fromEmail: "from@example.test" });
  });
  const send = () => new EmailNotificationService().sendEmailStrict({ to: { name: "Test", email: "to@example.test" }, subject: "Test", body: "Test" });
  it("records provider acceptance", async () => {
    provider.send.mockResolvedValue([{ headers: { "x-message-id": "provider-id" } }]);
    await expect(send()).resolves.toEqual({ messageId: "provider-id" });
  });
  it("connection failure is safe to retry and does not submit", async () => {
    provider.connect.mockRejectedValue(new Error("No credentials"));
    await expect(send()).rejects.toMatchObject({ ambiguous: false });
    expect(provider.send).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 429])("provider %s rejection is known failed", async code => {
    provider.send.mockRejectedValue({ code });
    await expect(send()).rejects.toMatchObject({ ambiguous: false });
  });
  it.each([500, 503, undefined])("provider %s or network failure is ambiguous", async code => {
    provider.send.mockRejectedValue({ code, message: "network error" });
    await expect(send()).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(send()).rejects.toMatchObject({ ambiguous: true });
  });
  it("escapes untrusted report HTML", () => {
    expect(escapeReportEmail("<script>alert('x')</script>\nNext")).not.toContain("<script>");
    expect(escapeReportEmail("one\ntwo")).toBe("one<br/>two");
  });
});
