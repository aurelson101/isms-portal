import { describe, expect, it, vi } from "vitest";
import { DirectoryService } from "./directory.service";

const connection = {
  id: "directory-1",
  primaryHost: "dc01.example.com",
  groupFilter: "(objectClass=group)",
  groupAttribute: "cn",
};

describe("DirectoryService selected group synchronization", () => {
  it("refreshes only groups already selected in the application", async () => {
    const selected = {
      id: "group-1",
      distinguishedName: "CN=ITAD,OU=Groups,DC=example,DC=com",
    };
    const search = vi.fn().mockResolvedValue({
      searchEntries: [
        {
          dn: selected.distinguishedName,
          cn: "ITAD",
          description: "Selected group",
          member: ["CN=Alice,OU=Users,DC=example,DC=com"],
        },
      ],
    });
    const client = { search, unbind: vi.fn().mockResolvedValue(undefined) };
    const directoryGroup = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([selected])
        .mockResolvedValueOnce([]),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
    };
    const directorySyncJob = {
      create: vi.fn().mockResolvedValue({ id: "job-1" }),
      update: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([{ id: "obsolete-job" }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      directorySyncJob,
      directoryGroup,
    };
    const service = new DirectoryService(prisma as never, {} as never);
    vi.spyOn(service as never, "connection").mockResolvedValue(connection);
    vi.spyOn(service as never, "bindWithFallback").mockResolvedValue({
      client,
      host: connection.primaryHost,
    });

    await expect(service.synchronize(connection.id)).resolves.toMatchObject({
      status: "SUCCESS",
      groups: 1,
      selectedGroups: 1,
    });
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith(
      selected.distinguishedName,
      expect.objectContaining({ scope: "base", sizeLimit: 1 }),
    );
    expect(directoryGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: selected.id } }),
    );
    expect(directoryGroup.create).not.toHaveBeenCalled();
    expect(directorySyncJob.findMany).toHaveBeenCalledWith({
      where: { connectionId: connection.id },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      skip: 100,
      select: { id: true },
    });
    expect(directorySyncJob.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["obsolete-job"] } },
    });
  });
});
