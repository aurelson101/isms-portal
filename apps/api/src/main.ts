import 'reflect-metadata';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE === 'true') {
    throw new Error('DEMO_MODE must never be enabled when NODE_ENV=production');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(helmet());
  app.useBodyParser('json', { limit: '256kb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  const config = new DocumentBuilder().setTitle('ISMS Portal API').setVersion('1.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(3001, '0.0.0.0');
}
void bootstrap();
