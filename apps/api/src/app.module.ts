import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  AdminController,
  CertificatesController,
  DirectoryController,
  DocumentAdminController,
  DocumentsController,
  HealthController,
  IdentityController,
  IncidentReportsController,
} from "./controllers";
import { IdentityMiddleware } from "./identity.middleware";
import { DocumentManagementController } from "./document-management.controller";
import { AdminGuard } from "./security";
import { PrismaService } from "./prisma.service";
import { AuthorizationService } from "./authorization.service";
import { AuditService } from "./audit.service";
import { StorageService } from "./storage.service";
import { StorageTargetsService } from "./storage-targets.service";
import {
  StorageTargetsController,
  StorageOptionsController,
} from "./storage-targets.controller";
import { AntivirusService } from "./antivirus.service";
import { CryptoService } from "./crypto.service";
import { DirectoryService } from "./directory.service";
import { AuthService } from "./auth.service";
import { AuthController, AdminAccountsController } from "./auth.controller";
import { WatermarkService } from "./watermark.service";
import { ObservabilityService } from "./observability.service";
import { SensitiveApprovalService } from "./sensitive-approval.service";
import {
  OperationsController,
  UserToolsController,
} from "./user-tools.controller";
import { GovernanceController } from "./governance.controller";
import { AlertDeliveryService } from "./alert-delivery.service";
import { BrandingController } from "./branding.controller";
import {
  ApprovalsController,
  ReviewInboxController,
} from "./approvals.controller";
import { NotificationService } from "./notification.service";

@Module({
  controllers: [
    StorageTargetsController,
    StorageOptionsController,
    ReviewInboxController,
    HealthController,
    IdentityController,
    DocumentsController,
    DocumentManagementController,
    IncidentReportsController,
    AdminController,
    DocumentAdminController,
    DirectoryController,
    CertificatesController,
    AuthController,
    AdminAccountsController,
    UserToolsController,
    OperationsController,
    GovernanceController,
    BrandingController,
    ApprovalsController,
  ],
  providers: [
    NotificationService,
    PrismaService,
    AuthorizationService,
    AuditService,
    StorageService,
    StorageTargetsService,
    AntivirusService,
    CryptoService,
    DirectoryService,
    AuthService,
    WatermarkService,
    ObservabilityService,
    SensitiveApprovalService,
    AlertDeliveryService,
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdentityMiddleware).forRoutes("*");
  }
}
