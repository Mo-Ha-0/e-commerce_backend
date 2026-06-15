import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
    private readonly logger = new Logger(CacheService.name);
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

    async get<T>(key: string): Promise<T | null> {
        const cached = await this.redis.get(key);
        if (cached === null) {
            return null;
        }
        try {
            return JSON.parse(cached) as T;
        } catch {
            this.logger.warn(`Failed to parse cache key: ${key}`);
            return null;
        }
    }

    async mget<T>(keys: string[]): Promise<(T | null)[]> {
        if (keys.length === 0) return [];
        const cachedArr = await this.redis.mget(...keys);
        
        return cachedArr.map((cached, index) => {
            if (cached === null) return null;
            try {
                return JSON.parse(cached) as T;
            } catch {
                this.logger.warn(`Failed to parse cache key: ${keys[index]}`);
                return null;
            }
        });
    }

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    }

    async invalidate(key: string): Promise<void> {
        await this.redis.del(key);
    }

    async invalidatePattern(pattern: string): Promise<void> {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100,
            );
            cursor = nextCursor;
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } while (cursor !== '0');
    }
}
