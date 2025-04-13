import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { LogsService, ErrorFilter, RequestsLoggerMiddleware } from '@thefirstspine/logs-nest';

async function bootstrap() {
  // Load dotev config
  require('dotenv').config();

  // Load appoptics config
  require('appoptics-apm');

  // Launch app
  const app = await NestFactory.create(AppModule.register());
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new ErrorFilter(new LogsService()));
  app.use(RequestsLoggerMiddleware.use);
  await app.listen(process.env.PORT);
}
bootstrap();
