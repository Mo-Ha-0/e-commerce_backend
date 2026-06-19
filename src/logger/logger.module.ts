import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerService } from './logger.service';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';

@Global()
@Module({
    providers: [
        LoggerService,
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
    ],
    exports: [LoggerService],
})
export class LoggerModule {}
