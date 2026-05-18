import { Controller, Get } from '@nestjs/common';
import * as os from 'os';

@Controller('health')
export class HealthController {
    @Get()
    check() {
        return {
            status: 'ok',
            pid: process.pid,
            hostname: os.hostname(),
            timestamp: new Date().toISOString(),
        };
    }

    @Get('stress')
    stress() {
        const start = Date.now();
        let result = 0;

        while (Date.now() - start < 100) {
            for (let i = 0; i < 1_000_000; i++) {
                result += Math.sqrt(i);
            }
        }

        return {
            hostname: os.hostname(),
            result,
            duration: `${Date.now() - start}ms`,
        };
    }
}
