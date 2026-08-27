import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class DocumentReviewDto {
  @IsString() @MinLength(1) @MaxLength(128) documentId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) versionId?: string;
  @IsString() @MinLength(2) @MaxLength(160) owner!: string;
  @IsString() @MinLength(2) @MaxLength(160) reviewer!: string;
  @IsString() @MinLength(2) @MaxLength(160) approver!: string;
  @IsDateString() dueAt!: string;
}

export class ReviewDecisionDto {
  @IsIn(["IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"])
  status!: "IN_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";
  @IsString() @MinLength(3) @MaxLength(2000) comment!: string;
}

export class AccessCertificationDto {
  @IsBoolean() lifetime!: boolean;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsDateString() certificationDueAt?: string;
  @IsString() @MinLength(3) @MaxLength(500) justification!: string;
}

export class ComplianceControlDto {
  @IsString() @MinLength(2) @MaxLength(80) framework!: string;
  @IsString() @MinLength(1) @MaxLength(80) reference!: string;
  @IsString() @MinLength(3) @MaxLength(240) title!: string;
  @IsIn(["APPLICABLE", "NOT_APPLICABLE"])
  applicability!: "APPLICABLE" | "NOT_APPLICABLE";
  @IsIn(["PLANNED", "PARTIAL", "IMPLEMENTED", "NOT_IMPLEMENTED"])
  implementationStatus!:
    | "PLANNED"
    | "PARTIAL"
    | "IMPLEMENTED"
    | "NOT_IMPLEMENTED";
  @IsString() @MinLength(2) @MaxLength(160) owner!: string;
  @IsOptional() @IsString() @MaxLength(2000) justification?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  evidenceDocumentId?: string;
}

export class RetentionPolicyDto {
  @IsString() @MinLength(1) @MaxLength(128) documentId!: string;
  @IsOptional() @IsDateString() retentionUntil?: string;
  @IsBoolean() legalHold!: boolean;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class RetentionDecisionDto {
  @IsIn(["REQUEST", "APPROVE", "REJECT"])
  action!: "REQUEST" | "APPROVE" | "REJECT";
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class IncidentCaseDto {
  @IsString() @MinLength(2) @MaxLength(80) reference!: string;
  @IsString() @MinLength(3) @MaxLength(240) title!: string;
  @IsIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
  severity!: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  @IsIn(["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"])
  status!: "OPEN" | "INVESTIGATING" | "CONTAINED" | "RESOLVED" | "CLOSED";
  @IsString() @MinLength(2) @MaxLength(160) owner!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(5000) rootCause?: string;
  @IsOptional() @IsString() @MaxLength(5000) lessonsLearned?: string;
}

export class CorrectiveActionDto {
  @IsString() @MinLength(3) @MaxLength(2000) description!: string;
  @IsString() @MinLength(2) @MaxLength(160) owner!: string;
  @IsDateString() dueAt!: string;
  @IsIn(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"])
  status!: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
}

export class SavedViewDto {
  @IsString() @MinLength(2) @MaxLength(80) section!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsObject() config!: Record<string, unknown>;
}

export class GovernanceBulkDto {
  @IsIn(["INCIDENT_STATUS", "REVIEW_STATUS"])
  kind!: "INCIDENT_STATUS" | "REVIEW_STATUS";
  @IsArray() @ArrayMaxSize(100) @IsUUID("4", { each: true }) ids!: string[];
  @IsString() @MinLength(2) @MaxLength(40) value!: string;
  @IsOptional() @IsBoolean() confirmed?: boolean;
}

export class RiskExceptionDto {
  @IsString() @MinLength(3) @MaxLength(240) title!: string;
  @IsString() @MinLength(2) @MaxLength(160) owner!: string;
  @IsString() @MinLength(10) @MaxLength(4000) justification!: string;
  @IsString() @MinLength(5) @MaxLength(4000) compensatingControl!: string;
  @IsString() @MinLength(2) @MaxLength(160) approver!: string;
  @IsDateString() expiresAt!: string;
}

export class RiskExceptionDecisionDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class SensitiveApprovalDto {
  @IsIn([
    "PERMANENT_DELETE",
    "BROAD_PRIVILEGE",
    "RETENTION_CHANGE",
    "SENSITIVE_EXPORT",
  ])
  operation!:
    | "PERMANENT_DELETE"
    | "BROAD_PRIVILEGE"
    | "RETENTION_CHANGE"
    | "SENSITIVE_EXPORT";
  @IsString() @MinLength(2) @MaxLength(80) targetType!: string;
  @IsString() @MinLength(1) @MaxLength(160) targetId!: string;
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}

export class SensitiveApprovalDecisionDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";
}
