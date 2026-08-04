import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OcrService } from './ocr.service';

jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
}));

describe('OcrService', () => {
  let service: OcrService;
  let createWorkerMock: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    createWorkerMock =
      require('tesseract.js').createWorker as unknown as jest.Mock;
    createWorkerMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('eng') },
        },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
  });

  it('should detect OCR candidates by mime type', () => {
    expect(service.isOcrCandidate('image/png')).toBe(true);
    expect(service.isOcrCandidate('application/pdf')).toBe(true);
    expect(service.isOcrCandidate('image/tiff')).toBe(true);
    expect(service.isOcrCandidate('image/JPEG')).toBe(true);
    expect(service.isOcrCandidate(null)).toBe(false);
    expect(service.isOcrCandidate('text/markdown')).toBe(false);
  });

  it('should extract text via tesseract', async () => {
    createWorkerMock.mockImplementation(async () => ({
      recognize: jest.fn().mockResolvedValue({ data: { text: 'Hello OCR' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));

    const result = await service.extractText('/tmp/scan.png');
    expect(result).toEqual({ text: 'Hello OCR', engine: 'tesseract' });
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
});