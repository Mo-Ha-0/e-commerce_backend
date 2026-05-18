import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
    imports: [
        PrometheusModule.register({
            path: '/actuator/prometheus',
            defaultMetrics: {
                enabled: true,
            },
        }),
    ],
})
export class MetricsModule {}
