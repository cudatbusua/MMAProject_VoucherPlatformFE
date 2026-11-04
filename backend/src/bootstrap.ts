import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Envelope, Errors, RejectNull } from './common/http';

export function configureApp(app: INestApplication, swagger = true) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new RejectNull(),
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new Envelope());
  app.useGlobalFilters(new Errors());
  const config = app.get(ConfigService);
  const origins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  if (swagger && config.get('NODE_ENV') !== 'production') {
    const definition = new DocumentBuilder()
      .setTitle('Voucher Platform — MongoDB API')
      .setVersion('0.1.0')
      .setDescription(
        'Project độc lập. MongoDB + NestJS. Thanh toán DEMO, không thu tiền thật. Login web bằng email/mật khẩu; khách hàng bằng OTP email.',
      )
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, definition);
    SwaggerModule.setup('docs', app, document, { swaggerOptions: { persistAuthorization: true } });
  }
  app.enableShutdownHooks();
}
