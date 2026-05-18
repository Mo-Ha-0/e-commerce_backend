import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between } from 'typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { Product } from '../../database/entities/product.entity';
import { SalesSummary } from '../../database/entities/sales-summary.entity';
import { MinioService } from '../../minio/minio.service';

type PdfDoc = InstanceType<typeof PDFDocument>;

@Injectable()
export class SalesSummaryPdfService {
    private readonly logger = new Logger(SalesSummaryPdfService.name);

    constructor(
        @InjectRepository(SalesSummary)
        private readonly salesSummaryRepository: Repository<SalesSummary>,
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        private readonly minioService: MinioService,
    ) {}

    async generateAndUploadForMonth(year: number, month: number) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const summaries = await this.salesSummaryRepository.find({
            where: { summaryDate: Between(startDate, endDate) },
            relations: { product: true },
            order: { summaryDate: 'ASC', totalQuantity: 'DESC' },
        });

        if (summaries.length === 0) {
            this.logger.warn(
                `No sales summaries found for ${year}-${String(month).padStart(2, '0')}`,
            );
            return null;
        }

        const pdfBuffer = await this.generatePdfBuffer(summaries);
        const generationDate = new Date().toISOString().split('T')[0];
        const key = `sales-summaries/summary-${generationDate}.pdf`;

        await this.minioService.uploadFile(key, pdfBuffer, 'application/pdf');

        this.logger.log(`Sales summary PDF uploaded to ${key}`);
        return key;
    }

    async getLatestPdfKey() {
        const files = await this.minioService.listFiles(
            'sales-summaries/summary-',
        );

        if (files.length === 0) {
            return null;
        }

        return files[files.length - 1];
    }

    async getPdfStream(key: string) {
        const response = await this.minioService.getFile(key);
        if (!response.Body) {
            throw new Error('Sales summary PDF not found');
        }
        return {
            stream: response.Body as NodeJS.ReadableStream,
            contentType: response.ContentType ?? 'application/pdf',
        };
    }

    private generatePdfBuffer(summaries: SalesSummary[]): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.drawHeader(doc, summaries);
            this.drawOverview(doc, summaries);
            this.drawProductBreakdown(doc, summaries);
            this.drawDailyBreakdown(doc, summaries);
            this.drawFooter(doc);

            doc.end();
        });
    }

    private drawHeader(doc: PdfDoc, summaries: SalesSummary[]) {
        doc.fontSize(24).text('Sales Summary Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, {
            align: 'center',
        });

        const dates = summaries.map((s) => s.summaryDate);
        const earliest = dates.reduce((a, b) => (a < b ? a : b));
        const latest = dates.reduce((a, b) => (a > b ? a : b));
        doc.text(`Period: ${earliest} to ${latest}`, { align: 'center' });

        doc.moveDown();
        doc.strokeColor('#cccccc')
            .lineWidth(1)
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .stroke();
        doc.moveDown();
    }

    private drawOverview(doc: PdfDoc, summaries: SalesSummary[]) {
        const totalRevenue = summaries.reduce(
            (acc, s) => acc + Number(s.totalRevenue),
            0,
        );
        const totalQuantity = summaries.reduce(
            (acc, s) => acc + s.totalQuantity,
            0,
        );
        const uniqueProducts = new Set(summaries.map((s) => s.productId)).size;
        const uniqueDays = new Set(summaries.map((s) => s.summaryDate)).size;
        const avgDailyRevenue = totalRevenue / uniqueDays;
        const avgOrderValue =
            totalQuantity > 0 ? totalRevenue / totalQuantity : 0;

        doc.fontSize(16).text('Overview').fillColor('#1a1a1a');
        doc.moveDown(0.5);

        const stats = [
            ['Total Revenue', `$${totalRevenue.toFixed(2)}`],
            ['Total Units Sold', totalQuantity.toString()],
            ['Products Sold', uniqueProducts.toString()],
            ['Active Days', uniqueDays.toString()],
            ['Average Daily Revenue', `$${avgDailyRevenue.toFixed(2)}`],
            ['Average Price Per Unit', `$${avgOrderValue.toFixed(2)}`],
        ];

        doc.fontSize(11);
        for (const [label, value] of stats) {
            doc.font('Helvetica-Bold').text(`${label}:`, { continued: true });
            doc.font('Helvetica').text(` ${value}`);
        }

        doc.moveDown();
        doc.strokeColor('#cccccc')
            .lineWidth(1)
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .stroke();
        doc.moveDown();
    }

    private drawProductBreakdown(doc: PdfDoc, summaries: SalesSummary[]) {
        const productMap = new Map<
            string,
            { name: string; quantity: number; revenue: number }
        >();

        for (const summary of summaries) {
            const existing = productMap.get(summary.productId) ?? {
                name: summary.product?.name ?? summary.productId,
                quantity: 0,
                revenue: 0,
            };
            existing.quantity += summary.totalQuantity;
            existing.revenue += Number(summary.totalRevenue);
            productMap.set(summary.productId, existing);
        }

        const sorted = [...productMap.entries()].sort(
            (a, b) => b[1].revenue - a[1].revenue,
        );

        doc.fontSize(16).text('Product Breakdown').fillColor('#1a1a1a');
        doc.moveDown(0.5);

        doc.fontSize(9).font('Helvetica-Bold');
        const colX = [50, 250, 370, 470];
        doc.text('Product', colX[0], doc.y, { width: colX[1] - colX[0] - 5 });
        doc.text('Qty Sold', colX[1], doc.y, {
            width: colX[2] - colX[1] - 5,
            align: 'center',
        });
        doc.text('Revenue', colX[2], doc.y, {
            width: colX[3] - colX[2] - 5,
            align: 'right',
        });
        doc.text('% of Total', colX[3], doc.y, { width: 70, align: 'right' });
        doc.moveDown(0.3);

        doc.strokeColor('#eeeeee')
            .lineWidth(0.5)
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .stroke();
        doc.moveDown(0.2);

        const totalRevenue = summaries.reduce(
            (acc, s) => acc + Number(s.totalRevenue),
            0,
        );

        doc.font('Helvetica').fontSize(10);
        for (const [, data] of sorted) {
            if (doc.y > 700) {
                doc.addPage();
            }

            const percent = ((data.revenue / totalRevenue) * 100).toFixed(1);

            doc.text(data.name, colX[0], doc.y, {
                width: colX[1] - colX[0] - 5,
            });
            doc.text(data.quantity.toString(), colX[1], doc.y, {
                width: colX[2] - colX[1] - 5,
                align: 'center',
            });
            doc.text(`$${data.revenue.toFixed(2)}`, colX[2], doc.y, {
                width: colX[3] - colX[2] - 5,
                align: 'right',
            });
            doc.text(`${percent}%`, colX[3], doc.y, {
                width: 70,
                align: 'right',
            });
            doc.moveDown(0.3);
        }

        doc.moveDown(0.3);
        doc.strokeColor('#cccccc')
            .lineWidth(1)
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .stroke();
        doc.moveDown();
    }

    private drawDailyBreakdown(doc: PdfDoc, summaries: SalesSummary[]) {
        const dailyMap = new Map<
            string,
            { quantity: number; revenue: number }
        >();

        for (const summary of summaries) {
            const existing = dailyMap.get(summary.summaryDate) ?? {
                quantity: 0,
                revenue: 0,
            };
            existing.quantity += summary.totalQuantity;
            existing.revenue += Number(summary.totalRevenue);
            dailyMap.set(summary.summaryDate, existing);
        }

        const sortedDays = [...dailyMap.entries()].sort((a, b) =>
            b[0].localeCompare(a[0]),
        );

        doc.fontSize(16).text('Daily Breakdown').fillColor('#1a1a1a');
        doc.moveDown(0.5);

        doc.fontSize(9).font('Helvetica-Bold');
        const colX = [50, 200, 350, 470];
        doc.text('Date', colX[0], doc.y, { width: colX[1] - colX[0] - 5 });
        doc.text('Units Sold', colX[1], doc.y, {
            width: colX[2] - colX[1] - 5,
            align: 'center',
        });
        doc.text('Revenue', colX[2], doc.y, {
            width: colX[3] - colX[2] - 5,
            align: 'right',
        });
        doc.moveDown(0.3);

        doc.strokeColor('#eeeeee')
            .lineWidth(0.5)
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .stroke();
        doc.moveDown(0.2);

        doc.font('Helvetica').fontSize(10);
        for (const [date, data] of sortedDays) {
            if (doc.y > 720) {
                doc.addPage();
            }

            doc.text(date, colX[0], doc.y, { width: colX[1] - colX[0] - 5 });
            doc.text(data.quantity.toString(), colX[1], doc.y, {
                width: colX[2] - colX[1] - 5,
                align: 'center',
            });
            doc.text(`$${data.revenue.toFixed(2)}`, colX[2], doc.y, {
                width: colX[3] - colX[2] - 5,
                align: 'right',
            });
            doc.moveDown(0.3);
        }

        doc.moveDown(0.3);
        doc.strokeColor('#cccccc')
            .lineWidth(1)
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .stroke();
        doc.moveDown();
    }

    private drawFooter(doc: PdfDoc) {
        doc.moveDown(2);
        doc.fontSize(8).fillColor('#999999');
        doc.text('E-Commerce Platform — Sales Summary Report', {
            align: 'center',
        });
        doc.text(`Report generated on ${new Date().toLocaleString()}`, {
            align: 'center',
        });
    }
}
