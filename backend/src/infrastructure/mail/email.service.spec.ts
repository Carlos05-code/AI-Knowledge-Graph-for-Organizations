import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('EmailService', () => {
  let service: EmailService;
  let createTransportMock: jest.Mock;
  let sendMailMock: jest.Mock;
  let configGet: jest.Mock;

  const setConfig = (values: Record<string, unknown>) => {
    configGet.mockImplementation(
      (key: string, def?: unknown) => values[key] ?? def,
    );
  };

  beforeEach(async () => {
    createTransportMock =
      require('nodemailer').createTransport as unknown as jest.Mock;
    createTransportMock.mockReset();
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'm1' });
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    configGet = jest.fn();
    setConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: 'false',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_FROM: 'noreply@example.com',
      MAIL_ENABLED: 'true',
      FRONTEND_URL: 'http://localhost:8080',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should deliver via smtp when configured', async () => {
    const result = await service.send({
      to: 'jane@acme.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    expect(result).toEqual({ delivered: true, mode: 'smtp', messageId: 'm1' });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: 'jane@acme.com',
        subject: 'Test',
      }),
    );
  });

  it('should log (not deliver) when SMTP_HOST is missing', async () => {
    setConfig({});
    const { EmailService: Reloaded } = require('./email.service');
    const reloaded = new Reloaded({ get: configGet }) as EmailService;

    const result = await reloaded.send({
      to: 'jane@acme.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    expect(result).toEqual({ delivered: false, mode: 'log' });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('should log instead of throw when smtp delivery fails', async () => {
    sendMailMock.mockRejectedValue(new Error('connection refused'));

    const result = await service.send({
      to: 'jane@acme.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    expect(result).toEqual({ delivered: false, mode: 'log' });
  });

  it('should build an invitation email with accept link', async () => {
    const result = await service.sendInvitationMail({
      to: 'jane@acme.com',
      organizationName: 'Acme Inc',
      inviterName: 'John Smith',
      token: 'tok-123',
    });
    expect(result.delivered).toBe(true);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.subject).toContain('Acme Inc');
    expect(mail.html).toContain(
      'http://localhost:8080/accept?token=tok-123&email=jane%40acme.com',
    );
    expect(mail.text).toContain('/accept?token=tok-123');
  });
});