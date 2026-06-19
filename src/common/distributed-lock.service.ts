import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as crypto from 'node:crypto';

const SAFE_RELEASE_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
    end
    return 0
`;

const SAFE_EXTEND_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
    end
    return 0
`;

const ACQUIRE_SEMAPHORE_SCRIPT = `
    redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2], "NX")
    local remaining = redis.call("DECR", KEYS[1])
    if remaining >= 0 then
        redis.call("PEXPIRE", KEYS[1], ARGV[2])
        return 1
    else
        redis.call("INCR", KEYS[1])
        return 0
    end
`;

const RELEASE_SEMAPHORE_SCRIPT = `
    if redis.call("EXISTS", KEYS[1]) == 1 then
        return redis.call("INCR", KEYS[1])
    end
    return 0
`;

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

    async acquire(key: string, ttlMs: number): Promise<string | null> {
        const token = crypto.randomUUID();
        const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
        const acquired = result === 'OK';
        if (!acquired) {
            this.logger.debug(`Lock not acquired: ${key}`);
            return null;
        }
        return token;
    }

    async release(key: string, token: string): Promise<void> {
        await this.redis.eval(SAFE_RELEASE_SCRIPT, 1, key, token);
    }

    async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
        const result = await this.redis.eval(
            SAFE_EXTEND_SCRIPT,
            1,
            key,
            token,
            ttlMs,
        );
        return result === 1;
    }

    async increment(key: string, ttlMs: number): Promise<number> {
        const count = await this.redis.incr(key);
        await this.redis.pexpire(key, ttlMs);
        return count;
    }

    async acquireSemaphore(
        key: string,
        initialCount: number,
        ttlMs: number,
    ): Promise<boolean> {
        const result = await this.redis.eval(
            ACQUIRE_SEMAPHORE_SCRIPT,
            1,
            key,
            String(initialCount),
            String(ttlMs),
        );
        return result === 1;
    }

    async releaseSemaphore(key: string): Promise<void> {
        await this.redis.eval(RELEASE_SEMAPHORE_SCRIPT, 1, key);
    }
}
