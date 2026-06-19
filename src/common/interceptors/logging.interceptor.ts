import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { LoggerService } from '../../logger/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly skippedPaths: string[] = ['/health', '/actuator'];

    constructor(private readonly loggerService: LoggerService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const url = request.originalUrl ?? request.url;

        if (this.skippedPaths.some((p) => url.startsWith(p))) {
            return next.handle();
        }

        const controller = context.getClass().name;
        const handler = context.getHandler().name;
        const method = request.method;
        const userId = request.user?.userId;
        const userRole = request.user?.role;
        const ip =
            request.ip ??
            request.headers?.['x-forwarded-for'] ??
            request.connection?.remoteAddress;
        const userAgent = request.headers?.['user-agent'];
        const requestBody = method !== 'GET' ? request.body : undefined;

        const startedAt = performance.now();

        return next.handle().pipe(
            tap({
                next: () => {
                    const duration = Math.round(performance.now() - startedAt);
                    const statusCode = response.statusCode ?? 200;

                    this.loggerService.logControllerAction(
                        controller,
                        handler,
                        method,
                        url,
                        statusCode,
                        duration,
                        userId,
                        userRole,
                        ip,
                        userAgent,
                        requestBody,
                    );
                },
                error: (error: any) => {
                    const duration = Math.round(performance.now() - startedAt);
                    const statusCode = error.status ?? error.statusCode ?? 500;

                    this.loggerService.logControllerAction(
                        controller,
                        handler,
                        method,
                        url,
                        statusCode,
                        duration,
                        userId,
                        userRole,
                        ip,
                        userAgent,
                        requestBody,
                        error.message,
                    );
                },
            }),
        );
    }
}
