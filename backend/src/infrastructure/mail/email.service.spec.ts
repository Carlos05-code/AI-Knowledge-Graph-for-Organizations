import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { PrismaService } from '../database/prisma.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('EmailService', () => {
  let service: EmailService;
  let createTransportMock: jest.Mock;
  let sendMailMock: jest.Mock;
  let configGet: jest.Mock;
  const mockPrisma = {
    outboundEmail: { create: jest.fn() },
  };

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
      SMTP_REQUIRE_TLS: 'false',
      SMTP_REJECT_UNAUTHORIZED: 'true',
      SMTP_RETRIES: '2',
      SMTP_RETRY_DELAY_MS: '1',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_FROM: 'noreply@example.com',
      MAIL_ENABLED: 'true',
      FRONTEND_URL: 'http://localhost:8080',
    });
    mockPrisma.outboundEmail.create.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: PrismaService, useValue: mockPrisma },
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
    expect(mockPrisma.outboundEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        to: 'jane@acme.com',
        subject: 'Test',
        mode: 'smtp',
        delivered: true,
        messageId: 'm1',
      }),
    });
  });

  it('should log (not deliver) when SMTP_HOST is missing', async () => {
    setConfig({});
    const { EmailService: Reloaded } = require('./email.service');
    const reloaded = new Reloaded(
      { get: configGet },
      mockPrisma,
    ) as EmailService;

    const result = await reloaded.send({
      to: 'jane@acme.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    expect(result).toEqual({ delivered: false, mode: 'log' });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(mockPrisma.outboundEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'log', delivered: false }),
    });
  });

  it('should log instead of throw when smtp delivery fails', async () => {
    sendMailMock.mockRejectedValue(new Error('connection refused'));

    const result = await service.send({
      to: 'jane@acme.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    expect(result).toEqual({ delivered: false, mode: 'log' });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(mockPrisma.outboundEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'smtp', delivered: false }),
    });
  });

  it('should retry transient failures and succeed', async () => {
    sendMailMock
      .mockRejectedValueOnce(new Error('temporary SMTP error'))
      .mockResolvedValueOnce({ messageId: 'm2' });

    const result = await service.send({
      to: 'jane@acme.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    expect(result).toEqual({ delivered: true, mode: 'smtp', messageId: 'm2' });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(mockPrisma.outboundEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'smtp', delivered: true }),
    });
  });

  it('should respect SMTP_RETRIES and log outbound failure after exhausting attempts', async () => {
    setConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: 'false',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_ENABLED: 'true',
      SMTP_RETRIES: '1',
      SMTP_RETRY_DELAY_MS: '1',
    });
    const { EmailService: Reloaded } = require('./email.service');
    const reloaded = new Reloaded(
      { get: configGet },
      mockPrisma,
    ) as EmailService;
    sendMailMock.mockRejectedValue(new Error('down'));

    const result = await reloaded.send({
      to: 'jane@acme.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ delivered: false, mode: 'log' });
  });

  it('should pass TLS options through to nodemailer', () => {
    setConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 465,
      SMTP_SECURE: 'true',
      SMTP_REQUIRE_TLS: 'true',
      SMTP_REJECT_UNAUTHORIZED: 'false',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_ENABLED: 'true',
    });
    const { EmailService: Reloaded } = require('./email.service');
    new Reloaded({ get: configGet }, mockPrisma);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        requireTLS: true,
        tls: { rejectUnauthorized: false },
      }),
    );
  });

  it('should build an invitation email with accept link', async () => {
    const result = await service.sendInvitationMail({
      to: 'jane@acme.com',
      organizationName: 'Acme Inc',
      inviterName: 'John Smith',
      token: 'tok-123',
      invitationId: 'inv-1',
      organizationId: 'org-1',
    });
    expect(result.delivered).toBe(true);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.subject).toContain('Acme Inc');
    expect(mail.html).toContain(
      'http://localhost:8080/accept?token=tok-123&email=jane%40acme.com',
    );
    expect(mail.text).toContain('/accept?token=tok-123');
    expect(mockPrisma.outboundEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invitationId: 'inv-1',
        organizationId: 'org-1',
      }),
    });
  });
});