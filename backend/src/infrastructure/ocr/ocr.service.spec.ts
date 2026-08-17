import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OcrService } from './ocr.service';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
}));

const tempFiles: string[] = [];
const makeTempPdf = async (): Promise<string> => {
  const filePath = join(
    tmpdir(),
    `ocr-test-${Date.now()}-${tempFiles.length}.pdf`,
  );
  await fs.writeFile(filePath, '%PDF-1.4 fake');
  tempFiles.push(filePath);
  return filePath;
};

const mockPdfParse = {
  text: '',
  total: 3,
  PDFParse: class {
    constructor(public params: any) {}
    async getText() {
      return { text: mockPdfParse.text, total: mockPdfParse.total };
    }
    async destroy() {}
  },
};

const mockPdfToImg = {
  pages: [] as Buffer[],
  pdf: jest.fn().mockImplementation(async () => ({
    length: mockPdfToImg.pages.length,
    [Symbol.asyncIterator]: async function* () {
      for (const page of mockPdfToImg.pages) {
        yield page;
      }
    },
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
};

jest.mock('pdf-parse', () => ({
  PDFParse: mockPdfParse.PDFParse,
}));

jest.mock('pdf-to-img', () => ({
  pdf: mockPdfToImg.pdf,
}));

describe('OcrService', () => {
  let service: OcrService;
  let createWorkerMock: jest.Mock;

  const buildService = async (configOverrides: Record<string, string> = {}) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              if (key in configOverrides) return configOverrides[key];
              if (key === 'OCR_LANGUAGE') return 'eng';
              if (key === 'OCR_MIN_CONFIDENCE') return '0';
              if (key === 'OCR_MAX_PAGES') return '50';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    return module.get<OcrService>(OcrService);
  };

  beforeEach(async () => {
    jest.resetModules();
    createWorkerMock = require('tesseract.js').createWorker as jest.Mock;
    createWorkerMock.mockReset();
    mockPdfParse.text = '';
    mockPdfParse.total = 3;
    mockPdfToImg.pages = [];
    service = await buildService();
  });

  afterAll(async () => {
    await Promise.all(
      tempFiles.splice(0).map((file) => fs.unlink(file).catch(() => undefined)),
    );
  });

  it('should detect OCR candidates by mime type', () => {
    expect(service.isOcrCandidate('image/png')).toBe(true);
    expect(service.isOcrCandidate('application/pdf')).toBe(true);
    expect(service.isOcrCandidate('image/tiff')).toBe(true);
    expect(service.isOcrCandidate('image/JPEG')).toBe(true);
    expect(service.isOcrCandidate(null)).toBe(false);
    expect(service.isOcrCandidate('text/markdown')).toBe(false);
  });

  it('should extract image text via tesseract', async () => {
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest.fn().mockResolvedValue({
        data: { text: 'Hello OCR', confidence: 92 },
      }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));

    const result = await service.extractText('/tmp/scan.png');
    expect(result).toEqual({
      text: 'Hello OCR',
      engine: 'tesseract',
      confidence: 92,
    });
  });

  it('should return null when OCR yields empty text', async () => {
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest.fn().mockResolvedValue({ data: { text: '   ' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));

    expect(await service.extractText('/tmp/scan.png')).toBeNull();
  });

  it('should return null and not throw when tesseract is unavailable', async () => {
    const reloaded = Object.create(OcrService.prototype) as OcrService;
    (reloaded as any)['logger'] = { warn: jest.fn() } as any;
    (reloaded as any)['tesseract'] = null;
    expect(await reloaded.extractText('/tmp/scan.png')).toBeNull();
  });

  it('should return null and not throw when recognition fails', async () => {
    createWorkerMock.mockImplementation(async () => {
      throw new Error('worker failed');
    });

    expect(await service.extractText('/tmp/scan.png')).toBeNull();
  });

  it('should extract PDF text layer via pdf-parse without OCR', async () => {
    mockPdfParse.text = 'PDF text page';
    mockPdfParse.total = 4;
    service = await buildService();

    const result = await service.extractText(await makeTempPdf());
    expect(result).toEqual({
      text: 'PDF text page',
      engine: 'pdf-parse',
      pages: 4,
    });
    expect(createWorkerMock).not.toHaveBeenCalled();
  });

  it('should OCR scanned PDF page-by-page when no text layer', async () => {
    mockPdfToImg.pages = [Buffer.from('p1'), Buffer.from('p2')];
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest.fn().mockResolvedValue({ data: { text: 'Page text' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));
    service = await buildService();

    const result = await service.extractText(await makeTempPdf());
    expect(result).toEqual({
      text: 'Page text\n\nPage text',
      engine: 'tesseract',
      pages: 2,
    });
    expect(createWorkerMock).toHaveBeenCalledTimes(1);
  });

  it('should cap scanned PDF OCR at OCR_MAX_PAGES', async () => {
    mockPdfToImg.pages = [
      Buffer.from('p1'),
      Buffer.from('p2'),
      Buffer.from('p3'),
    ];
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest.fn().mockResolvedValue({ data: { text: 'X' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));
    service = await buildService({ OCR_MAX_PAGES: '2' });

    const result = await service.extractText(await makeTempPdf());
    expect(result?.pages).toBe(2);
    expect(result?.text).toBe('X\n\nX');
  });

  it('should drop pages below OCR_MIN_CONFIDENCE', async () => {
    mockPdfToImg.pages = [Buffer.from('p1')];
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest
        .fn()
        .mockResolvedValue({ data: { text: 'Low conf', confidence: 30 } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));
    service = await buildService({ OCR_MIN_CONFIDENCE: '50' });

    const result = await service.extractText(await makeTempPdf());
    expect(result).toBeNull();
  });

  it('should reject image OCR below OCR_MIN_CONFIDENCE', async () => {
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest
        .fn()
        .mockResolvedValue({ data: { text: 'junk', confidence: 12 } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));
    service = await buildService({ OCR_MIN_CONFIDENCE: '50' });

    expect(await service.extractText('/tmp/scan.png')).toBeNull();
  });

  it('should normalize comma-separated language packs', async () => {
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest.fn().mockResolvedValue({ data: { text: 'Hola' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));
    service = await buildService({ OCR_LANGUAGE: 'eng,spa' });

    await service.extractText('/tmp/scan.png');
    expect(createWorkerMock).toHaveBeenCalledWith(
      'eng+spa',
      1,
      expect.any(Object),
    );
  });
});
