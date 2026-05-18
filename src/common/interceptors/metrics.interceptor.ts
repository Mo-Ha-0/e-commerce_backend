import { Injectable } from '@nestjs/common';
import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import * as promClient from 'prom-client';

const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest<{
            method: string;
            originalUrl?: string;
            url: string;
        }>();
        const res = context.switchToHttp().getResponse<{ statusCode: number }>();
        const startedAt = performance.now();

        return next.handle().pipe(
            tap(() => {
                const duration = (performance.now() - startedAt) / 1000;
                const route = req.originalUrl ?? req.url;
                const statusCode = res.statusCode ?? 200;

                httpRequestDuration.labels(req.method, route, String(statusCode)).observe(duration);
                httpRequestsTotal.labels(req.method, route, String(statusCode)).inc();
            }),
        );
    }
}
