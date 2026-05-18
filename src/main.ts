import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.useGlobalInterceptors(new PerformanceInterceptor());
    app.useGlobalInterceptors(new MetricsInterceptor());

    await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
