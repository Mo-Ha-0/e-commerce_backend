import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    CreateBucketCommand,
    HeadBucketCommand,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';

@Injectable()
export class MinioService implements OnModuleInit {
    private readonly logger = new Logger(MinioService.name);
    private readonly client: S3Client;
    private readonly bucket: string;

    constructor(private readonly configService: ConfigService) {
        const endpoint = this.configService.get<string>(
            'MINIO_ENDPOINT',
            'minio',
        );
        const port = this.configService.get<number>('MINIO_PORT', 9000);
        const accessKey = this.configService.get<string>(
            'MINIO_ROOT_USER',
            'minioadmin',
        );
        const secretKey = this.configService.get<string>(
            'MINIO_ROOT_PASSWORD',
            'minioadmin123',
        );
        const useSSL =
            this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';

        this.bucket = this.configService.get<string>(
            'MINIO_BUCKET',
            'invoices',
        );

        this.client = new S3Client({
            endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
            region: 'us-east-1',
            credentials: {
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
            },
            forcePathStyle: true,
        });
    }

    async onModuleInit() {
        await this.ensureBucketExists();
    }

    private async ensureBucketExists() {
        try {
            await this.client.send(
                new HeadBucketCommand({ Bucket: this.bucket }),
            );
            this.logger.log(`Bucket "${this.bucket}" already exists`);
        } catch {
            this.logger.log(`Creating bucket "${this.bucket}"...`);
            await this.client.send(
                new CreateBucketCommand({ Bucket: this.bucket }),
            );
            this.logger.log(`Bucket "${this.bucket}" created successfully`);
        }
    }

    async uploadFile(key: string, buffer: Buffer, contentType: string) {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            }),
        );
        return key;
    }

    async getFile(key: string) {
        const response = await this.client.send(
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }),
        );
        return response;
    }

    async listFiles(prefix: string) {
        const response = await this.client.send(
            new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefix,
            }),
        );
        return (response.Contents ?? [])
            .map((obj) => obj.Key)
            .filter(Boolean) as string[];
    }

    getBucket() {
        return this.bucket;
    }
}
