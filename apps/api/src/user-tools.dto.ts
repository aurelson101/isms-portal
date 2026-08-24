import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class UserPreferenceDto {
  @IsIn(["fr", "en"])
  locale!: "fr" | "en";

  @IsIn(["list", "grid"])
  viewMode!: "list" | "grid";

  @IsIn(["comfortable", "compact"])
  density!: "comfortable" | "compact";
}

export class SavedSearchDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsObject() filters!: Record<string, unknown>;
}

export class AccessRequestDto {
  @IsUUID() spaceId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) documentId?: string;
  @IsString() @MinLength(5) @MaxLength(1000) justification!: string;
}

export class DocumentReportDto {
  @IsString() @MinLength(1) @MaxLength(160) documentId!: string;
  @IsIn(["OUTDATED", "INCORRECT", "SENSITIVE", "OTHER"])
  reason!: "OUTDATED" | "INCORRECT" | "SENSITIVE" | "OTHER";
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}

export class ReviewDto {
  @IsIn(["APPROVED", "REJECTED", "RESOLVED"])
  status!: "APPROVED" | "REJECTED" | "RESOLVED";
  @IsOptional() @IsString() @MaxLength(1000) decision?: string;
}

export class ObservabilityOptionsDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(255) endpoint?: string;
  @IsOptional() @IsString() @MaxLength(255) certificateReference?: string;
}

export class AlertPolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsIn(["email", "teams", "slack", "webhook", "none"])
  channel!: "email" | "teams" | "slack" | "webhook" | "none";
  @IsOptional() @IsString() @MaxLength(255) destinationReference?: string;
  @IsString() @MaxLength(10) fiveXxPercent!: string;
  @IsString() @MaxLength(10) deniedPerMinute!: string;
}
