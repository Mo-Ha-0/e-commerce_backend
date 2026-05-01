import {
    CallHandler,
    ExecutionContext,
    Injectable,
    Logger,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
    private readonly logger = new Logger(PerformanceInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest<{
            method: string;
            originalUrl?: string;
            url: string;
        }>();
        const startedAt = performance.now();

        return next.handle().pipe(
            tap(() => {
                const duration = Math.round(performance.now() - startedAt);
                const url = request.originalUrl ?? request.url;
                this.logger.log(`${request.method} ${url} ${duration}ms`);
            }),
        );
    }
}
