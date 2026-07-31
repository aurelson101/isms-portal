import {
  IsBoolean,
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
} from "class-validator";

export class LocalePreferenceDto {
  @IsIn(["fr", "en"])
  locale!: "fr" | "en";
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
  @IsBoolean() administer!: boolean;
}

export class DirectoryGroupDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MinLength(3) @MaxLength(1024) distinguishedName!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
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
