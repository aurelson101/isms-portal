import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminAccountsController } from "./auth.controller";

const request = {
  identity: { username: "admin", groups: ["ISMS-LOCAL-ADMINS"] },
} as never;

const setup = () => {
  const prisma = {
    adminAccount: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "directory-admin-1",
          username: data.username,
          displayName: data.displayName,
          source: data.source,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
        }),
      ),
    },
    userPreference: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const sensitiveApprovals = {
    require: vi.fn().mockResolvedValue(""),
    execute: vi.fn().mockResolvedValue(null),
  };
  const controller = new AdminAccountsController(
    prisma as never,
    { hashPassword: vi.fn() } as never,
    audit as never,
    {} as never,
    sensitiveApprovals as never,
  );
  return { controller, prisma };
};

describe("AdminAccountsController privilege lifecycle", () => {
  it("grants an immediately active temporary directory privilege with only an expiry", async () => {
    const { controller, prisma } = setup();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await controller.create(request, {
      username: "alice@example.com",
      displayName: "Alice",
      source: "DIRECTORY",
      justification: "Temporary administration",
      validUntil: expiry,
    });

    expect(prisma.adminAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          validFrom: null,
          validUntil: new Date(expiry),
        }),
      }),
    );
  });

  it("rejects a future privilege start without an expiry", async () => {
    const { controller } = setup();

    await expect(
      controller.create(request, {
        username: "alice@example.com",
        displayName: "Alice",
        source: "DIRECTORY",
        justification: "Future administration",
        validFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AdminAccountsController profile", () => {
  it("stores a group administrator photo without creating a permanent account", async () => {
    const { controller, prisma } = setup();
    const profilePhoto = "data:image/png;base64,iVBORw0KGgo=";

    await expect(
      controller.profile(request, {
        displayName: "Group Admin",
        profilePhoto,
      }),
    ).resolves.toEqual({
      username: "admin",
      displayName: "Group Admin",
      profilePhoto,
    });
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith({
      where: { identity: "admin" },
      update: {
        adminDisplayName: "Group Admin",
        adminProfilePhoto: profilePhoto,
      },
      create: {
        identity: "admin",
        adminDisplayName: "Group Admin",
        adminProfilePhoto: profilePhoto,
      },
    });
    expect(prisma.adminAccount.create).not.toHaveBeenCalled();
  });
});
