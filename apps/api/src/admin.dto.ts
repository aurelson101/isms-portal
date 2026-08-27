import {
  IsBoolean,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class LocalePreferenceDto {
  @IsIn(["fr", "en"])
  locale!: "fr" | "en";
}

export class LoginDto {
  @IsString() @MinLength(1) @MaxLength(160) username!: string;
  @IsString() @MinLength(1) @MaxLength(1024) password!: string;
  @IsOptional() @IsString() @MaxLength(6) mfaCode?: string;
}

export class DirectoryLoginDto {
  @IsString() @MinLength(1) @MaxLength(128) login!: string;
  @IsString() @MinLength(1) @MaxLength(1024) password!: string;
  @IsOptional() @IsBoolean() rememberDevice?: boolean;
}

export class ProfileDto {
  @IsString() @MinLength(2) @MaxLength(160) displayName!: string;
  @IsOptional() @IsString() @MaxLength(350000) profilePhoto?: string | null;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(1024) currentPassword!: string;
  @IsString() @MinLength(14) @MaxLength(1024) newPassword!: string;
}

export class MfaConfirmDto {
  @IsString() @MinLength(6) @MaxLength(6) code!: string;
}

export class CreateAdminDto {
  @IsString() @MinLength(2) @MaxLength(160) username!: string;
  @IsString() @MinLength(2) @MaxLength(160) displayName!: string;
  @IsIn(["LOCAL", "DIRECTORY"]) source!: "LOCAL" | "DIRECTORY";
  @IsOptional() @IsString() @MinLength(14) @MaxLength(1024) password?: string;
  @IsString() @MinLength(3) @MaxLength(500) justification!: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
}

export class CreateAdminDirectoryGroupDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MinLength(3) @MaxLength(1024) distinguishedName!: string;
  @IsString() @MinLength(3) @MaxLength(500) justification!: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsBoolean() largeGroupConfirmed?: boolean;
}

export class AdminActiveDto {
  @IsBoolean() active!: boolean;
}

export class SpaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameFr!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameEn!: string;
}

export class CategoryDto extends SpaceDto {
  @IsUUID()
  spaceId!: string;
}

export class AccessRuleDto {
  @IsUUID() groupId!: string;
  @IsUUID() spaceId!: string;
  @IsBoolean() showMenu!: boolean;
  @IsBoolean() read!: boolean;
  @IsBoolean() search!: boolean;
  @IsBoolean() preview!: boolean;
  @IsBoolean() download!: boolean;
  @IsBoolean() upload!: boolean;
  @IsBoolean() edit!: boolean;
  @IsBoolean() publish!: boolean;
  @IsBoolean() archive!: boolean;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsBoolean() lifetime?: boolean;
  @IsOptional() @IsString() @MaxLength(500) justification?: string;
}

export class AccessRuleBulkDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessRuleDto)
  rules!: AccessRuleDto[];
}

export class AccessSimulationDto {
  @IsOptional() @IsString() @MaxLength(255) identity?: string;
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  groups!: string[];
}

export class SpaceOwnerDto {
  @IsOptional() @IsUUID() groupId?: string;
}

export class AccessSnapshotDto {
  @IsString() @MinLength(2) @MaxLength(120) label!: string;
}

export class AnnualIncidentReportDto {
  @IsInt() @Min(2000) @Max(2100) year!: number;
  @IsInt() @Min(0) @Max(1000000) totalIncidents!: number;
  @IsInt() @Min(0) @Max(1000000) criticalIncidents!: number;
  @IsInt() @Min(0) @Max(1000000) resolvedIncidents!: number;
  @IsString() @MinLength(3) @MaxLength(10000) summary!: string;
  @IsOptional() @IsString() @MaxLength(10000) lessonsLearned?: string;
  @IsIn(["DRAFT", "PUBLISHED"]) status!: "DRAFT" | "PUBLISHED";
}

export class DocumentMetadataDto {
  @IsIn(["fr", "en"])
  locale!: "fr" | "en";

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeSummary?: string;
}

export class DirectoryGroupDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MinLength(3) @MaxLength(1024) distinguishedName!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class ImportDirectoryGroupDto {
  @IsUUID() connectionId!: string;
  @IsString() @MinLength(3) @MaxLength(1024) distinguishedName!: string;
}

export class DirectoryConnectionDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(2) @MaxLength(255) domain!: string;
  @IsString() @MinLength(1) @MaxLength(255) primaryHost!: string;
  @IsOptional() @IsString() @MaxLength(255) secondaryHost?: string;
  @IsInt() @Min(1) @Max(65535) port!: number;
  @IsIn(["LDAP", "LDAPS"]) protocol!: "LDAP" | "LDAPS";
  @IsString() @IsNotEmpty() @MaxLength(1024) baseDn!: string;
  @IsOptional() @IsString() @MaxLength(1024) userBaseDn?: string;
  @IsOptional() @IsString() @MaxLength(1024) groupBaseDn?: string;
  @IsString() @IsNotEmpty() @MaxLength(1024) bindDn!: string;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(1024) bindSecret?: string;
  @IsString() @MaxLength(1024) userFilter!: string;
  @IsString() @MaxLength(1024) groupFilter!: string;
  @IsString() @MaxLength(80) loginAttribute!: string;
  @IsString() @MaxLength(80) usernameAttribute!: string;
  @IsString() @MaxLength(80) groupAttribute!: string;
  @IsString() @MaxLength(80) emailAttribute!: string;
  @IsBoolean() nestedGroups!: boolean;
  @IsInt() @Min(5) @Max(10080) syncIntervalMinutes!: number;
  @IsInt() @Min(500) @Max(60000) timeoutMs!: number;
  @IsInt() @Min(0) @Max(10) retries!: number;
  @IsBoolean() enabled!: boolean;
  @IsOptional()
  @ValidateIf((value) => value.caCertificateId !== null)
  @IsUUID()
  caCertificateId?: string | null;
}
