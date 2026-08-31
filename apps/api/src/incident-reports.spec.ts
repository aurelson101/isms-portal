import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "./prisma.service";
import { IncidentReportsController } from "./controllers";

describe("IncidentReportsController", () => {
  it("only exposes published reports in read-only form", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      annualIncidentReport: { findMany },
    } as unknown as PrismaService;
    const controller = new IncidentReportsController(prisma);

    await expect(
      controller.publishedReports({
        identity: { groups: ["ISMS-Readers"] },
      } as never),
    ).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: "PUBLISHED",
        OR: [
          { audience: { none: {} } },
          {
            audience: {
              some: {
                group: {
                  active: true,
                  OR: [
                    {
                      name: {
                        equals: "ISMS-Readers",
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        year: true,
        totalIncidents: true,
        criticalIncidents: true,
        resolvedIncidents: true,
        summary: true,
        lessonsLearned: true,
        updatedAt: true,
      },
      orderBy: { year: "desc" },
    });
  });

  it("lets administrators read every published report", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      annualIncidentReport: { findMany },
    } as unknown as PrismaService;
    const controller = new IncidentReportsController(prisma);

    await controller.publishedReports({
      identity: { groups: ["ISMS-LOCAL-ADMINS"] },
    } as never);

    expect(findMany.mock.calls[0][0].where).toEqual({ status: "PUBLISHED" });
  });
});
