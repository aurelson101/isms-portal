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

    await expect(controller.publishedReports()).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "PUBLISHED" },
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
});
