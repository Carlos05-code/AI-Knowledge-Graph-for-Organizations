import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OcrResult {
  text: string;
  engine: string;
  pages?: number;
  confidence?: number;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private tesseract: any = null;
  private pdfParse: any = null;
  private pdfToImg: any = null;

  private static readonly OCR_TYPES: ReadonlySet<string> = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/tiff',
    'image/bmp',
  ]);

  constructor(private config: ConfigService) {
    if (this.config.get('OCR_ENABLED', 'true') === 'false') {
      this.logger.warn('OCR disabled via OCR_ENABLED=false');
      return;
    }
    try {
      this.tesseract = require('tesseract.js');
    } catch {
      this.tesseract = null;
    }
    try {
      this.pdfParse = require('pdf-parse');
    } catch {
      this.pdfParse = null;
    }
    try {
      this.pdfToImg = require('pdf-to-img');
    } catch {
      this.pdfToImg = null;
    }
  }

  isOcrCandidate(mimeType?: string | null): boolean {
    return OcrService.OCR_TYPES.has((mimeType || '').toLowerCase());
  }

  private get languages(): string {
    const raw = String(this.config.get('OCR_LANGUAGE', 'eng') || 'eng');
    // tesseract.js accepts `eng+spa` style packs; accept comma-separated too
    return raw.includes(',')
      ? raw
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('+')
      : raw;
  }

  private get minConfidence(): number {
    return Number(this.config.get('OCR_MIN_CONFIDENCE', '0') || '0');
  }

  private get maxPdfPages(): number {
    return Number(this.config.get('OCR_MAX_PAGES', '50') || '50');
  }

  async extractText(filePath: string): Promise<OcrResult | null> {
    if (!this.tesseract) {
      this.logger.warn(
        'tesseract.js not available, OCR skipped for scanned content',
      );
      return null;
    }
    if (filePath.toLowerCase().endsWith('.pdf')) {
      return this.extractPdfText(filePath);
    }
    return this.extractImageText(filePath);
  }

  /**
   * PDF fast path: extract the embedded text layer page-by-page with
   * pdf-parse; only when it yields no text (scanned PDF) fall back to
   * rendering pages and OCR-ing each one.
   */
  private async extractPdfText(filePath: string): Promise<OcrResult | null> {
    try {
      const pdfParse = this.pdfParse?.default ?? this.pdfParse;
      if (pdfParse) {
        const parser = new pdfParse.PDFParse({
          data: await this.readFile(filePath),
        });
        try {
          const textResult = await parser.getText();
          const text = (textResult?.text || '').trim();
          if (text.length > 0) {
            return {
              text,
              engine: 'pdf-parse',
              pages: textResult.total || undefined,
            };
          }
        } finally {
          try {
            await parser.destroy();
          } catch {
            // best-effort cleanup
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `pdf-parse text extraction failed, falling back to page OCR: ${String(error instanceof Error ? error.message : error)}`,
      );
    }

    return this.extractScannedPdfText(filePath);
  }

  private async extractScannedPdfText(
    filePath: string,
  ): Promise<OcrResult | null> {
    const pdfToImg = this.pdfToImg?.default ?? this.pdfToImg;
    if (!pdfToImg) {
      this.logger.warn('pdf-to-img not available, scanned PDF OCR skipped');
      return null;
    }

    let worker: any = null;
    try {
      const document = await pdfToImg.pdf(filePath, { scale: 2 });
      const totalPages = document.length;
      const pageCount = Math.min(totalPages, this.maxPdfPages);
      const pageTexts: string[] = [];
      const confidences: number[] = [];
      worker = await this.tesseract.createWorker(this.languages, 1, {
        logger: (m: any) => {
          if (m && m.status === 'recognizing text') {
            this.logger.debug(`OCR progress ${m.progress}`);
          }
        },
      });

      let pageNumber = 0;
      for await (const pageBuffer of document) {
        pageNumber += 1;
        if (pageNumber > this.maxPdfPages) {
          this.logger.warn(
            `PDF has ${totalPages} pages; OCR capped at ${this.maxPdfPages} (OCR_MAX_PAGES)`,
          );
          break;
        }
        const { data } = await worker.recognize(pageBuffer);
        const pageText = (data && data.text ? data.text : '').trim();
        const confidence =
          data && typeof data.confidence === 'number' && data.confidence > 0
            ? data.confidence
            : 0;
        if (confidence > 0) {
          confidences.push(confidence);
        }
        if (this.minConfidence > 0 && confidence < this.minConfidence) {
          this.logger.debug(
            `OCR page ${pageNumber} confidence ${confidence} below threshold ${this.minConfidence}, skipping page text`,
          );
          continue;
        }
        if (pageText) {
          pageTexts.push(pageText);
        }
      }
      try {
        await document.destroy();
      } catch {
        // best-effort cleanup
      }

      const text = pageTexts.join('\n\n').trim();
      if (!text) {
        this.logger.warn(
          'OCR returned no text for scanned PDF (pages may be below confidence threshold)',
        );
        return null;
      }
      const avgConfidence = confidences.length
        ? Math.round(
            confidences.reduce((a, b) => a + b, 0) / confidences.length,
          )
        : undefined;
      return {
        text,
        engine: 'tesseract',
        pages: pageCount,
        confidence: avgConfidence,
      };
    } catch (error) {
      this.logger.error(
        'Scanned PDF OCR failed, falling back to empty content',
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // best-effort worker cleanup
        }
      }
    }
  }

  private async extractImageText(filePath: string): Promise<OcrResult | null> {
    let worker: any = null;
    try {
      worker = await this.tesseract.createWorker(this.languages, 1, {
        logger: (m: any) => {
          if (m && m.status === 'recognizing text') {
            this.logger.debug(`OCR progress ${m.progress}`);
          }
        },
      });
      const { data } = await worker.recognize(filePath);
      const text = (data && data.text ? data.text : '').trim();
      if (!text) {
        this.logger.warn('OCR returned no text for scanned content');
        return null;
      }
      const confidence =
        data && typeof data.confidence === 'number'
          ? data.confidence
          : undefined;
      if (
        this.minConfidence > 0 &&
        confidence !== undefined &&
        confidence < this.minConfidence
      ) {
        this.logger.warn(
          `OCR confidence ${confidence} below threshold ${this.minConfidence}, discarding result`,
        );
        return null;
      }
      return {
        text,
        engine: 'tesseract',
        confidence,
      };
    } catch (error) {
      this.logger.error(
        'OCR extraction failed, falling back to empty content',
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // best-effort worker cleanup
        }
      }
    }
  }

  private async readFile(filePath: string): Promise<Uint8Array> {
    const fs = require('fs') as typeof import('fs');
    return new Uint8Array(await fs.promises.readFile(filePath));
  }
}
