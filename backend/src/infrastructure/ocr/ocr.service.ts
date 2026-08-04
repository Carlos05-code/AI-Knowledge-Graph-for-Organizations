import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OcrResult {
  text: string;
  engine: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private tesseract: any = null;

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
  }

  isOcrCandidate(mimeType?: string | null): boolean {
    return OcrService.OCR_TYPES.has((mimeType || '').toLowerCase());
  }

  async extractText(filePath: string): Promise<OcrResult | null> {
    if (!this.tesseract) {
      this.logger.warn(
        'tesseract.js not available, OCR skipped for scanned content',
      );
      return null;
    }

    let worker: any = null;
    try {
      const language = this.config.get('OCR_LANGUAGE', 'eng');
      worker = await this.tesseract.createWorker(language, 1, {
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
      return { text, engine: 'tesseract' };
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
}