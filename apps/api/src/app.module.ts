import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminController, CertificatesController, DocumentsController, HealthController, IdentityController } from './controllers';
import { IdentityMiddleware } from './identity.middleware';
import { AdminGuard } from './security';
import { PrismaService } from './prisma.service';
import { AuthorizationService } from './authorization.service';

@Module({
  controllers: [HealthController, IdentityController, DocumentsController, AdminController, CertificatesController],
  providers: [PrismaService, AuthorizationService, { provide: APP_GUARD, useClass: AdminGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdentityMiddleware).forRoutes('*');
  }
}
