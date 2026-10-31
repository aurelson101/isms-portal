import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  NotificationService,
  notificationConnection,
} from "./notification.service";
import { notificationHtml } from "./notification-email";

const previousPublicUrl = process.env.PUBLIC_URL;
beforeAll(() => {
  process.env.PUBLIC_URL = "https://isms.example.com";
});
afterAll(() => {
  if (previousPublicUrl === undefined) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = previousPublicUrl;
});

function setup() {
  const prisma = {
    documentReview: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        owner: "alice",
        reviewer: "bob",
        approver: "carol",
        documentId: "doc",
        status: "REJECTED",
        decisionComment: "Needs revision",
        dueAt: new Date(),
      }),
    },
    directoryGroup: {
      findMany: vi.fn().mockResolvedValue([
        { name: "IT", distinguishedName: "CN=IT", directoryConnectionId: "dc" },
        { name: "expired", distinguishedName: "CN=expired" },
      ]),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({
        id: "doc",
        slug: "test",
        spaceId: "it",
        status: "PUBLISHED",
        deletedAt: null,
        translations: [{ locale: "en", title: "Policy <script>" }],
        space: { nameEn: "IT", deletedAt: null },
        category: { nameEn: "Security" },
        versions: [{ version: 2 }],
      }),
    },
    documentReport: {
      findUnique: vi.fn().mockResolvedValue({
        identity: "alice",
        documentId: "doc",
        status: "OPEN",
        reason: "OUTDATED",
      }),
    },
    documentVersion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    adminAccount: {
      findMany: vi.fn().mockResolvedValue([{ username: "admin" }]),
    },
    adminDirectoryGroup: {
      findMany: vi.fn().mockResolvedValue([{ distinguishedName: "CN=Admin" }]),
    },
  };
  const directory = {
    emailsForGroup: vi.fn().mockResolvedValue(["member@example.com"]),
    emailsForIdentities: vi.fn().mockResolvedValue(["user@example.com"]),
  };
  const alerts = {
    sendPreferredTo: vi.fn().mockResolvedValue({ delivered: true }),
  };
  const auth = { can: vi.fn(async (groups) => groups[0] !== "expired") };
  const service = new NotificationService(
    prisma as never,
    directory as never,
    alerts as never,
    auth as never,
  );
  return { prisma, directory, alerts, auth, service };
}
const event = {
  action: "document.publish",
  resource: "document:doc",
  actor: "publisher",
  at: "2026-09-11T12:00:00Z",
};
describe("Notification routing", () => {
  it("repeats only eligible overdue reviews and never marks a failed delivery", async () => {
    const h = setup();
    h.prisma.documentReview.findMany.mockResolvedValue([
      {
        id: "review",
        documentId: "doc",
        dueAt: new Date("2026-08-01T00:00:00Z"),
        document: { translations: [{ locale: "en", title: "Policy" }] },
      },
    ]);
    vi.spyOn(h.service, "staff").mockResolvedValue(["editor@example.test"]);
    const cutoff = "2026-10-24T00:00:00.000Z";
    const data = {
      ...event,
      action: "document-review.overdue",
      reviewIds: ["review"],
      reviewReminderBefore: cutoff,
    };
    h.alerts.sendPreferredTo.mockResolvedValueOnce({ delivered: false });
    await expect(
      h.service.process({ data, updateData: vi.fn() } as never),
    ).rejects.toThrow();
    expect(h.prisma.documentReview.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.documentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PENDING", "IN_REVIEW"] },
          document: { status: "PUBLISHED", deletedAt: null },
          OR: [
            { overdueNotifiedAt: null },
            { overdueNotifiedAt: { lte: new Date(cutoff) } },
          ],
        }),
      }),
    );
    await h.service.process({ data, updateData: vi.fn() } as never);
    expect(h.prisma.documentReview.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { overdueNotifiedAt: expect.any(Date) },
      }),
    );
  });
  it("groups publication summaries by recipient without revealing another reader's documents", async () => {
    const h = setup();
    const document = (id: string, spaceId: string) => ({
      id,
      slug: id,
      spaceId,
      translations: [{ locale: "en", title: id }],
      space: { nameEn: spaceId },
      category: null,
      versions: [{ version: 1 }],
    });
    h.prisma.document.findMany.mockResolvedValue([
      document("IT Policy", "it"),
      document("HR Policy", "hr"),
      document("IT Guide", "it"),
    ] as never);
    vi.spyOn(h.service, "staff").mockResolvedValue(["moderator@example.test"]);
    const audience = vi
      .spyOn(h.service, "spaceAudience")
      .mockImplementation(async (spaceId) =>
        spaceId === "it"
          ? ["alice@example.test", "SHARED@example.test"]
          : ["bob@example.test", "shared@example.test"],
      );
    const data = {
      ...event,
      action: "document.publication.digest",
      resource: "document-batch:test",
      documentIds: ["it", "hr", "guide"],
    };
    const job = { data, updateData: vi.fn() };
    await h.service.process(job as never);
    expect(audience).toHaveBeenCalledTimes(2);
    expect(h.alerts.sendPreferredTo).toHaveBeenCalledTimes(4);
    const deliveries = h.alerts.sendPreferredTo.mock.calls as unknown as Array<
      [string[], string, string]
    >;
    const alice = deliveries.find(
      ([recipients]) => recipients[0] === "alice@example.test",
    )!;
    const bob = deliveries.find(
      ([recipients]) => recipients[0] === "bob@example.test",
    )!;
    expect(alice[1]).toContain("2 document(s)");
    expect(alice[2]).toContain("IT Guide");
    expect(alice[2]).not.toContain("HR Policy");
    expect(bob[1]).toContain("1 document(s)");
    expect(bob[2]).toContain("HR Policy");
    expect(bob[2]).not.toContain("IT Policy");
    expect(h.prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          deletedAt: null,
          space: { deletedAt: null },
        }),
      }),
    );
  });
  it("skips a summary whose documents are no longer published", async () => {
    const h = setup();
    const result = await h.service.process({
      data: {
        ...event,
        action: "document.publication.digest",
        documentIds: ["deleted"],
      },
    } as never);
    expect(result.accepted).toBe(0);
    expect(h.alerts.sendPreferredTo).not.toHaveBeenCalled();
  });
  it("retries the original failed delivery without creating a duplicate", async () => {
    const h = setup();
    const data = { ...event, accepted: ["first@example.com"] };
    const job = {
      data,
      getState: vi.fn().mockResolvedValue("failed"),
      retry: vi.fn().mockResolvedValue(undefined),
    };
    const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
    Object.defineProperty(h.service, "queue", { value: queue });

    await h.service.retryDelivery("failed-delivery");

    expect(queue.getJob).toHaveBeenCalledWith("failed-delivery");
    expect(job.retry).toHaveBeenCalledWith("failed", {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(job.data.accepted).toEqual(["first@example.com"]);
    expect(queue.add).not.toHaveBeenCalled();
  });
  it.each(["active", "waiting", "delayed", "completed"])(
    "does not retry a %s delivery",
    async (state) => {
      const h = setup();
      const job = {
        getState: vi.fn().mockResolvedValue(state),
        retry: vi.fn(),
      };
      const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
      Object.defineProperty(h.service, "queue", { value: queue });

      await expect(h.service.retryDelivery("delivery")).rejects.toThrow(
        "Only failed email deliveries",
      );

      expect(job.retry).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );
  it("propagates an atomic retry conflict without creating another delivery", async () => {
    const h = setup();
    const job = {
      getState: vi.fn().mockResolvedValue("failed"),
      retry: vi.fn().mockRejectedValue(new Error("Job is no longer failed")),
    };
    const queue = { getJob: vi.fn().mockResolvedValue(job), add: vi.fn() };
    Object.defineProperty(h.service, "queue", { value: queue });

    await expect(h.service.retryDelivery("delivery")).rejects.toThrow(
      "Job is no longer failed",
    );

    expect(queue.add).not.toHaveBeenCalled();
  });
  it("sends one overdue publication-review digest to staff and marks it only after acceptance", async () => {
    const h = setup();
    h.prisma.documentReview.findMany.mockResolvedValue([
      {
        id: "review",
        documentId: "doc",
        dueAt: new Date("2026-08-01T00:00:00Z"),
        document: {
          translations: [{ locale: "fr", title: "Politique de voyage" }],
        },
      },
    ]);
    vi.spyOn(h.service, "staff").mockResolvedValue([
      "moderator@example.com",
      "admin@example.com",
    ]);
    const digest = {
      ...event,
      action: "document-review.overdue",
      resource: "review-overdue:batch",
      reviewIds: ["review"],
    };
    const message = await h.service.prepare(digest);
    expect(message?.recipients).toEqual([
      "moderator@example.com",
      "admin@example.com",
    ]);
    expect(message?.text).toContain("Politique de voyage");
    const job = { data: digest, updateData: vi.fn() };
    await h.service.process(job as never);
    expect(h.prisma.documentReview.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { overdueNotifiedAt: expect.any(Date) },
      }),
    );
  });
  it("distinguishes skipped deliveries from accepted mail with full queue counts", async () => {
    const h = setup();
    const job = (id: string, timestamp: number) => ({
      id,
      data: event,
      timestamp,
      attemptsMade: 0,
      finishedOn: undefined,
      failedReason: undefined,
      returnvalue: undefined,
    });
    Object.assign(h.prisma, {
      notificationOutbox: { count: vi.fn().mockResolvedValue(3) },
    });
    const queue = {
      getJobCounts: vi.fn().mockResolvedValue({
        waiting: 201,
        active: 1,
        delayed: 2,
        completed: 3,
        failed: 0,
      }),
      getWaiting: vi.fn().mockResolvedValue([job("waiting", 1)]),
      getActive: vi.fn().mockResolvedValue([job("active", 2)]),
      getDelayed: vi.fn().mockResolvedValue([job("delayed", 3)]),
      getCompleted: vi.fn().mockResolvedValue([
        job("completed", 4),
        {
          ...job("skipped", 5),
          returnvalue: {
            skipped: "Resource no longer eligible",
            accepted: 0,
            audience: 0,
          },
        },
      ]),
      getFailed: vi.fn().mockResolvedValue([]),
    };
    Object.defineProperty(h.service, "queue", { value: queue });
    const result = await h.service.deliveryHistory();
    expect(await h.service.deliveryCounts()).toEqual({
      waiting: 201,
      active: 1,
      delayed: 2,
      completed: 3,
      failed: 0,
      pendingOutbox: 3,
    });
    expect(result.map(({ status }) => status)).toEqual([
      "SKIPPED",
      "ACCEPTED",
      "DELAYED",
      "ACTIVE",
      "WAITING",
    ]);
    expect(result[0].accepted).toBe(0);
  });
  it("does not send mail when a queued resource is no longer eligible", async () => {
    const h = setup();
    vi.spyOn(h.service, "prepare").mockResolvedValue(null);
    expect(await h.service.process({ data: event } as never)).toEqual({
      skipped: "Resource no longer eligible",
      accepted: 0,
      audience: 0,
    });
    expect(h.alerts.sendPreferredTo).not.toHaveBeenCalled();
  });
  it("uses ACL credentials and TLS for a rediss connection", () => {
    vi.stubEnv("REDIS_URL", "rediss://queue-user:p%40ss@redis.example:6380");
    try {
      expect(notificationConnection()).toEqual({
        host: "redis.example",
        port: 6380,
        username: "queue-user",
        password: "p@ss",
        tls: {},
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each(["", "/", "/0", "/2", "/15"])(
    "honors the Redis database path %s",
    (pathname) => {
      vi.stubEnv("REDIS_URL", `redis://redis.example:6379${pathname}`);
      try {
        const connection = notificationConnection();
        expect(connection.db ?? 0).toBe(Number(pathname.slice(1)));
        expect(connection.host).toBe("redis.example");
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
  it.each(["-1", "1.5", "1/2", "9007199254740992", "secret-value"])(
    "rejects an invalid Redis database %s without disclosing the URL",
    (database) => {
      vi.stubEnv(
        "REDIS_URL",
        `redis://user:private-password@redis.example/${database}`,
      );
      try {
        expect(() => notificationConnection()).toThrow(
          "REDIS_URL database must be a non-negative safe integer",
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
  it.each(["document.publish", "document.published"])(
    "routes %s to authorized readers",
    async (action) => {
      const h = setup();
      const result = await h.service.prepare({ ...event, action });
      expect(result?.recipients).toEqual(["member@example.com"]);
      expect(result?.link).toMatch(/\/documents\/test$/u);
      expect(result?.text).toContain("Security category within IT");
      expect(h.directory.emailsForGroup).toHaveBeenCalledTimes(1);
      expect(h.directory.emailsForGroup).toHaveBeenCalledWith("CN=IT", "dc");
      expect(h.auth.can).toHaveBeenCalledWith(["expired"], "it", "read", null);
    },
  );
  it("never sends a publication to readers when the document is draft", async () => {
    const h = setup();
    h.prisma.document.findUnique.mockResolvedValue({
      status: "DRAFT",
      space: {},
    } as never);
    expect(await h.service.prepare(event)).toBeNull();
    expect(h.directory.emailsForGroup).not.toHaveBeenCalled();
  });
  it("sends review decisions to assigned participants, not the reader audience", async () => {
    const h = setup();
    await h.service.prepare({
      ...event,
      action: "document-review.decision",
      resource: "document-review:review",
    });
    expect(h.directory.emailsForIdentities).toHaveBeenCalledWith([
      "alice",
      "bob",
      "carol",
    ]);
    expect(h.directory.emailsForGroup).toHaveBeenCalledWith("CN=Admin");
    expect(h.auth.can).not.toHaveBeenCalled();
  });
  it("routes annual document reviews to staff only", async () => {
    const h = setup();
    const result = await h.service.prepare({
      ...event,
      action: "document.review.annual",
    });
    expect(result?.recipients).toEqual(
      expect.arrayContaining(["user@example.com", "member@example.com"]),
    );
    expect(h.auth.can).not.toHaveBeenCalled();
    expect(result?.subject).toContain("annual review is due now");
  });
  it("routes reports to managers and the reporter", async () => {
    const h = setup();
    const result = await h.service.prepare({
      ...event,
      action: "document-report.create",
      resource: "document-report:report",
    });
    expect(result?.recipients).toEqual(
      expect.arrayContaining(["user@example.com", "member@example.com"]),
    );
    expect(h.auth.can).toHaveBeenCalledWith(["IT"], "it", "edit", null);
  });
  it("records accepted recipients and does not resend them on retry", async () => {
    const h = setup();
    vi.spyOn(h.service, "prepare").mockResolvedValue({
      recipients: ["first@example.com", "second@example.com"],
      subject: "Subject",
      text: "Body",
      link: "https://isms.example.com/",
    });
    const job = {
      data: { ...event, accepted: ["first@example.com"] },
      updateData: vi.fn(),
    };
    await h.service.process(job as never);
    expect(h.alerts.sendPreferredTo).toHaveBeenCalledTimes(1);
    expect(h.alerts.sendPreferredTo.mock.calls[0][0]).toEqual([
      "second@example.com",
    ]);
    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        accepted: ["first@example.com", "second@example.com"],
      }),
    );
  });
  it("deduplicates case variants without mixing personalized messages", async () => {
    const h = setup();
    vi.spyOn(h.service, "prepare").mockResolvedValue({
      recipients: [
        " Member@example.com ",
        "member@EXAMPLE.COM",
        "other@example.com",
      ],
      subject: "Shared subject",
      text: "Shared body",
      link: "https://isms.example.com/",
      recipientMessages: new Map([
        [
          " Member@example.com ",
          { subject: "Member subject", text: "Member-only content" },
        ],
        [
          "other@example.com",
          { subject: "Other subject", text: "Other-only content" },
        ],
      ]),
    });
    const job = { data: event, updateData: vi.fn() };
    expect(await h.service.process(job as never)).toEqual({
      accepted: 2,
      audience: 2,
    });
    expect(h.alerts.sendPreferredTo).toHaveBeenCalledTimes(2);
    expect(h.alerts.sendPreferredTo.mock.calls[0].slice(0, 3)).toEqual([
      ["Member@example.com"],
      "Member subject",
      "Member-only content",
    ]);
    expect(h.alerts.sendPreferredTo.mock.calls[1].slice(0, 3)).toEqual([
      ["other@example.com"],
      "Other subject",
      "Other-only content",
    ]);
    expect(job.updateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accepted: ["member@example.com", "other@example.com"],
      }),
    );
  });
  it("recognizes previously accepted recipients regardless of case or whitespace", async () => {
    const h = setup();
    vi.spyOn(h.service, "prepare").mockResolvedValue({
      recipients: ["member@example.com", "other@example.com"],
      subject: "Subject",
      text: "Body",
      link: "https://isms.example.com/",
    });
    const job = {
      data: { ...event, accepted: [" Member@EXAMPLE.COM "] },
      updateData: vi.fn(),
    };
    expect(await h.service.process(job as never)).toEqual({
      accepted: 2,
      audience: 2,
    });
    expect(h.alerts.sendPreferredTo).toHaveBeenCalledTimes(1);
    expect(h.alerts.sendPreferredTo.mock.calls[0][0]).toEqual([
      "other@example.com",
    ]);
  });
  it("retries only the failed recipient when directory address casing changes", async () => {
    const h = setup();
    const message = {
      subject: "Subject",
      text: "Body",
      link: "https://isms.example.com/",
    };
    vi.spyOn(h.service, "prepare")
      .mockResolvedValueOnce({
        ...message,
        recipients: ["First@example.com", "second@example.com"],
      })
      .mockResolvedValueOnce({
        ...message,
        recipients: ["first@example.com", "SECOND@example.com"],
      });
    h.alerts.sendPreferredTo
      .mockResolvedValueOnce({ delivered: true })
      .mockRejectedValueOnce(new Error("Temporary delivery failure"));
    const job = {
      data: { ...event, accepted: [] as string[] },
      updateData: vi.fn(),
    };
    job.updateData.mockImplementation(async (data) => {
      job.data = data;
    });
    await expect(h.service.process(job as never)).rejects.toThrow(
      "Temporary delivery failure",
    );
    expect(job.data.accepted).toEqual(["first@example.com"]);
    expect(await h.service.process(job as never)).toEqual({
      accepted: 2,
      audience: 2,
    });
    expect(h.alerts.sendPreferredTo.mock.calls.map((call) => call[0])).toEqual([
      ["First@example.com"],
      ["second@example.com"],
      ["SECOND@example.com"],
    ]);
  });
  it("resumes persisted recipient checkpoints in a fresh worker instance", async () => {
    const first = setup();
    const prepared = {
      recipients: ["first@example.com", "second@example.com"],
      subject: "Subject",
      text: "Body",
      link: "https://isms.example.com/",
    };
    vi.spyOn(first.service, "prepare").mockResolvedValue(prepared);
    first.alerts.sendPreferredTo
      .mockResolvedValueOnce({ delivered: true })
      .mockRejectedValueOnce(new Error("Service down"));
    const job = {
      data: { ...event, accepted: [] as string[] },
      updateData: vi.fn(),
    };
    job.updateData.mockImplementation(async (data) => {
      job.data = JSON.parse(JSON.stringify(data));
    });
    await expect(first.service.process(job as never)).rejects.toThrow(
      "Service down",
    );
    const restarted = setup();
    vi.spyOn(restarted.service, "prepare").mockResolvedValue(prepared);
    expect(
      await restarted.service.process({
        data: JSON.parse(JSON.stringify(job.data)),
        updateData: vi.fn(),
      } as never),
    ).toEqual({ accepted: 2, audience: 2 });
    expect(restarted.alerts.sendPreferredTo).toHaveBeenCalledTimes(1);
    expect(restarted.alerts.sendPreferredTo.mock.calls[0][0]).toEqual([
      "second@example.com",
    ]);
  });
  it("marks an annual review version only after delivery", async () => {
    const h = setup();
    vi.spyOn(h.service, "prepare").mockResolvedValue({
      recipients: ["staff@example.com"],
      subject: "Subject",
      text: "Body",
      link: "https://isms.example.com/",
    });
    await h.service.process({
      data: {
        ...event,
        action: "document.review.annual",
        documentVersionId: "version",
      },
      updateData: vi.fn(),
    } as never);
    expect(h.prisma.documentVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "version", annualReviewNotifiedAt: null },
      }),
    );
  });
  it("fails visibly on an empty audience", async () => {
    const h = setup();
    h.prisma.directoryGroup.findMany.mockResolvedValue([]);
    await expect(h.service.process({ data: event } as never)).rejects.toThrow(
      "No eligible mail recipients",
    );
    expect(h.alerts.sendPreferredTo).not.toHaveBeenCalled();
  });
  it("escapes all user input and restricts action links", () => {
    const html = notificationHtml(
      "<img src=x>",
      '<script>alert(1)</script>\n"Reason"',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('lang="en"');
    expect(html).toContain("max-width:600px");
    expect(() => notificationHtml("x", "y", "https://evil.example/")).toThrow(
      "Invalid notification link",
    );
  });
  it("requires an explicit HTTPS public URL for notification links", () => {
    delete process.env.PUBLIC_URL;
    expect(() => notificationHtml("Subject", "Body")).toThrow(
      "PUBLIC_URL is required",
    );
    process.env.PUBLIC_URL = "https://isms.example.com";
  });
  it("creates direct, contextual approval and review messages", async () => {
    const h = setup();
    h.prisma.sensitiveOperationApproval = {
      findUnique: vi.fn().mockResolvedValue({
        operation: "PERMANENT_DELETE",
        targetType: "DOCUMENT",
        targetId: "doc",
        requestedBy: "alice",
        reason: "Retention expired",
        status: "PENDING",
        approvedBy: null,
      }),
    };
    const approval = await h.service.prepare({
      ...event,
      action: "sensitive-approval.request",
      resource: "sensitive-approval:approval",
    });
    expect(approval?.subject).toContain("Approval required");
    expect(approval?.link).toMatch(/\/approvals#approval-approval$/u);
    expect(approval?.text).toContain("A second administrator");
    h.prisma.documentReview.findUnique.mockResolvedValueOnce({
      owner: "alice",
      reviewer: "bob",
      approver: "carol",
      documentId: "doc",
      status: "PENDING",
      decisionComment: null,
      decidedBy: null,
      dueAt: new Date(),
    });
    const review = await h.service.prepare({
      ...event,
      action: "document-review.create",
      resource: "document-review:review",
    });
    expect(review?.subject).toContain("Document review assigned");
    expect(review?.link).toMatch(/\/approvals#review-review$/u);
    const html = notificationHtml(
      review!.subject,
      review!.text,
      review!.link,
      "approval",
    );
    expect(html).toContain("ACTION REQUIRED");
    expect(html).toContain("Review request");
    expect(html).toContain("Due date");
  });
});
