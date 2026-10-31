import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { AdminOnly } from "./security";
import { AuditService } from "./audit.service";
import { AuthorizationService } from "./authorization.service";
import { StorageService } from "./storage.service";
import { StorageTargetsService } from "./storage-targets.service";
import type { IsmsRequest } from "./types";

@AdminOnly()
@Controller("admin/storage-targets")
export class StorageTargetsController {
  constructor(
    private readonly targets: StorageTargetsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.targets.list();
  }

  @Get("options")
  options() {
    return this.targets.available();
  }

  @Post()
  async create(@Req() req: IsmsRequest, @Body() body: Record<string, unknown>) {
    const result = await this.targets.create(body);
    await this.audit.record(
      req,
      "storage.target.create",
      `storage:${result.id}`,
      "success",
      { type: result.type },
    );
    return result;
  }

  @Put(":id")
  async update(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.targets.update(id, body);
    await this.audit.record(
      req,
      "storage.target.update",
      `storage:${id}`,
      "success",
      { enabled: result.enabled },
    );
    return result;
  }

  @Post(":id/test")
  async test(@Req() req: IsmsRequest, @Param("id") id: string) {
    const result = await this.storage.testTarget(id);
    await this.audit.record(
      req,
      "storage.target.test",
      `storage:${id}`,
      result.success ? "success" : "failure",
    );
    return result;
  }
}

@Controller("storage-options")
export class StorageOptionsController {
  constructor(
    private readonly targets: StorageTargetsService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Get()
  async list(@Req() req: IsmsRequest, @Query("spaceId") spaceId: string) {
    if (!spaceId) throw new ForbiddenException();
    const permissions = await this.authorization.permittedSpacesFor(
      req.identity.groups,
      ["upload", "edit"],
      spaceId,
    );
    if (
      ![...permissions.values()].some((spaces) =>
        spaces.some((space) => space.id === spaceId),
      )
    )
      throw new ForbiddenException();
    return this.targets.available();
  }
}
