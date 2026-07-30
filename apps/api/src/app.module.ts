import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  AdminController, CertificatesController, DirectoryController, DocumentAdminController,
  DocumentsController, HealthController, IdentityController,
} from './controllers';
import { IdentityMiddleware } from './identity.middleware';
import { AdminGuard } from './security';
import { PrismaService } from './prisma.service';
import { AuthorizationService } from './authorization.service';
import { AuditService } from './audit.service';
import { StorageService } from './storage.service';
import { AntivirusService } from './antivirus.service';
import { CryptoService } from './crypto.service';
import { DirectoryService } from './directory.service';

@Module({
  controllers: [
    HealthController, IdentityController, DocumentsController, AdminController,
    DocumentAdminController, DirectoryController, CertificatesController,
  ],
  providers: [
    PrismaService, AuthorizationService, AuditService, StorageService, AntivirusService,
    CryptoService, DirectoryService, { provide: APP_GUARD, useClass: AdminGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdentityMiddleware).forRoutes('*');
  }
}
