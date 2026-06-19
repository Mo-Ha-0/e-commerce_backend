import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LoggerService implements NestLoggerService {
    private readonly logger: winston.Logger;
    private readonly endpointLoggers: Map<string, winston.Logger> = new Map();
    private readonly logsDir: string;

    constructor() {
        this.logsDir = path.resolve('./logs');

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.errors({ stack: true }),
                winston.format.json(),
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.printf(
                            ({
                                timestamp,
                                level,
                                message,
                                context,
                                ...meta
                            }) => {
                                const ctx = context ? `[${context}]` : '';
                                const metaStr = Object.keys(meta).length
                                    ? ` ${JSON.stringify(meta)}`
                                    : '';
                                return `${timestamp} ${level} ${ctx} ${message}${metaStr}`;
                            },
                        ),
                    ),
                }),
                new winston.transports.File({
                    filename: path.join(this.logsDir, 'combined.log'),
                    format: winston.format.json(),
                    maxsize: 10 * 1024 * 1024,
                    maxFiles: 5,
                }),
                new winston.transports.File({
                    filename: path.join(this.logsDir, 'error.log'),
                    level: 'error',
                    format: winston.format.json(),
                    maxsize: 10 * 1024 * 1024,
                    maxFiles: 5,
                }),
            ],
        });
    }

    private controllerToFolder(controller: string): string {
        return controller.replace(/Controller$/i, '').toLowerCase();
    }

    private handlerToFileName(handler: string): string {
        return `${handler}_logs.log`;
    }

    private getEndpointLogger(
        controller: string,
        handler: string,
    ): winston.Logger {
        const key = `${controller}.${handler}`;
        let endpointLogger = this.endpointLoggers.get(key);
        if (!endpointLogger) {
            const folder = this.controllerToFolder(controller);
            const fileName = this.handlerToFileName(handler);
            const dirPath = path.join(this.logsDir, folder);

            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            endpointLogger = winston.createLogger({
                format: winston.format.combine(
                    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                    winston.format.json(),
                ),
                transports: [
                    new winston.transports.File({
                        filename: path.join(dirPath, fileName),
                        maxsize: 5 * 1024 * 1024,
                        maxFiles: 3,
                    }),
                ],
            });
            this.endpointLoggers.set(key, endpointLogger);
        }
        return endpointLogger;
    }

    logControllerAction(
        controller: string,
        handler: string,
        method: string,
        url: string,
        statusCode: number,
        duration: number,
        userId?: string,
        userRole?: string,
        ip?: string,
        userAgent?: string,
        requestBody?: unknown,
        responseBody?: unknown,
    ): void {
        const meta: Record<string, unknown> = {
            handler,
            method,
            url,
            statusCode,
            duration,
        };
        if (userId) meta.userId = userId;
        if (userRole) meta.userRole = userRole;
        if (ip) meta.ip = ip;
        if (userAgent) meta.userAgent = userAgent;
        if (requestBody) meta.requestBody = requestBody;
        if (responseBody) meta.responseBody = responseBody;

        const level =
            statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
        const message = `${method} ${url} ${statusCode} ${duration}ms`;

        this.logger.log(level, message, { context: controller, ...meta });

        this.getEndpointLogger(controller, handler).log(level, message, {
            context: controller,
            ...meta,
        });
    }

    log(message: string, context?: string): void {
        this.logger.info(message, { context });
    }

    error(message: string, trace?: string, context?: string): void {
        this.logger.error(message, { trace, context });
    }

    warn(message: string, context?: string): void {
        this.logger.warn(message, { context });
    }

    debug(message: string, context?: string): void {
        this.logger.debug(message, { context });
    }

    verbose(message: string, context?: string): void {
        this.logger.verbose(message, { context });
    }
}
