import "reflect-metadata";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { collectDefaultMetrics } from "prom-client";
import { httpDuration, httpRequests } from "./metrics";
import { sameOriginMutationGuard } from "./http-security";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const express = app.getHttpAdapter().getInstance();
  express.disable("x-powered-by");
  express.set("trust proxy", false);
  collectDefaultMetrics({ prefix: "isms_" });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      const route = request.route?.path || request.path;
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      httpRequests.inc({
        method: request.method,
        route,
        status_class: `${Math.floor(response.statusCode / 100)}xx`,
      });
      httpDuration.observe({ method: request.method, route }, elapsedSeconds);
      process.stdout.write(
        `${JSON.stringify({
          level: "info",
          service: "api",
          event: "http.request",
          time: new Date().toISOString(),
          correlationId: response.getHeader("x-request-id") || null,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        })}\n`,
      );
    });
    next();
  });
  app.use(helmet());
  app.use(sameOriginMutationGuard);
  app.useBodyParser("json", { limit: "256kb" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  const config = new DocumentBuilder()
    .setTitle("ISMS Portal API")
    .setVersion("1.0")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  await app.listen(3001, "0.0.0.0");
}
void bootstrap();
