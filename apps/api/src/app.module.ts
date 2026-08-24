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
import { AdminGuard } from "./security";
import { PrismaService } from "./prisma.service";
import { AuthorizationService } from "./authorization.service";
import { AuditService } from "./audit.service";
import { StorageService } from "./storage.service";
import { AntivirusService } from "./antivirus.service";
import { CryptoService } from "./crypto.service";
import { DirectoryService } from "./directory.service";
import { AuthService } from "./auth.service";
import { AuthController, AdminAccountsController } from "./auth.controller";
import { WatermarkService } from "./watermark.service";
import { ObservabilityService } from "./observability.service";
import {
  OperationsController,
  UserToolsController,
} from "./user-tools.controller";

@Module({
  controllers: [
    HealthController,
    IdentityController,
    DocumentsController,
    IncidentReportsController,
    AdminController,
    DocumentAdminController,
    DirectoryController,
    CertificatesController,
    AuthController,
    AdminAccountsController,
    UserToolsController,
    OperationsController,
  ],
  providers: [
    PrismaService,
    AuthorizationService,
    AuditService,
    StorageService,
    AntivirusService,
    CryptoService,
    DirectoryService,
    AuthService,
    WatermarkService,
    ObservabilityService,
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdentityMiddleware).forRoutes("*");
  }
}
