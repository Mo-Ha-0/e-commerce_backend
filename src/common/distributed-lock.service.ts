import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class DistributedLockService implements OnModuleDestroy {
    private readonly logger = new Logger(DistributedLockService.name);
    private readonly redis: Redis;

    constructor(private readonly configService: ConfigService) {
        this.redis = new Redis({
            host: this.configService.get<string>('REDIS_HOST', 'localhost'),
            port: Number(this.configService.get<string>('REDIS_PORT', '6379')),
        });
    }

    async onModuleDestroy() {
        await this.redis.quit();
    }

    async acquire(key: string, ttlMs: number): Promise<boolean> {
        const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
        const acquired = result === 'OK';
        if (!acquired) {
            this.logger.debug(`Lock not acquired: ${key}`);
        }
        return acquired;
    }

    async release(key: string): Promise<void> {
        await this.redis.del(key);
    }
}
