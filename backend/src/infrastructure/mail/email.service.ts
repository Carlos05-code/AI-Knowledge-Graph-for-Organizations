import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  invitationId?: string;
  organizationId?: string;
}

export interface SendMailResult {
  delivered: boolean;
  mode: 'smtp' | 'log';
  messageId?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: any = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    if (this.config.get('MAIL_ENABLED', 'true') === 'false') {
      this.logger.warn('Email delivery disabled via MAIL_ENABLED=false');
      return;
    }

    const host = this.config.get('SMTP_HOST');
    if (!host) {
      this.logger.warn(
        'SMTP_HOST not configured - emails will be logged, not delivered',
      );
      return;
    }

    try {
      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT', 587)),
        secure: this.config.get('SMTP_SECURE', 'false') === 'true',
        requireTLS: this.config.get('SMTP_REQUIRE_TLS', 'false') === 'true',
        tls: {
          rejectUnauthorized:
            this.config.get('SMTP_REJECT_UNAUTHORIZED', 'true') !== 'false',
        },
        auth: this.config.get('SMTP_USER')
          ? {
              user: this.config.get('SMTP_USER'),
              pass: this.config.get('SMTP_PASS'),
            }
          : undefined,
      });
    } catch {
      this.transporter = null;
      this.logger.warn(
        'nodemailer not available - emails will be logged, not delivered',
      );
    }
  }

  get acceptLinkBase(): string {
    return this.config.get('FRONTEND_URL', 'http://localhost:8080');
  }

  private get maxRetries(): number {
    return Number(this.config.get('SMTP_RETRIES', '2') || '2');
  }

  private get retryDelayMs(): number {
    return Number(this.config.get('SMTP_RETRY_DELAY_MS', '1000') || '1000');
  }

  async send(options: SendMailOptions): Promise<SendMailResult> {
    if (!this.transporter) {
      await this.logOutboundEmail(options, {
        mode: 'log',
        delivered: false,
      });
      this.logEmailFallback(options);
      return { delivered: false, mode: 'log' };
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const from =
          this.config.get('MAIL_FROM') ||
          'AI Knowledge Graph <noreply@localhost>';
        const result = await this.transporter.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text || '',
        });
        await this.logOutboundEmail(options, {
          mode: 'smtp',
          delivered: true,
          messageId: result.messageId,
        });
        return { delivered: true, mode: 'smtp', messageId: result.messageId };
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          this.logger.warn(
            `Email to ${options.to} attempt ${attempt}/${this.maxRetries} failed, retrying`,
            error instanceof Error ? error.message : error,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelayMs * attempt),
          );
        }
      }
    }

    this.logger.error(
      `Email to ${options.to} failed after ${this.maxRetries} attempts - falling back to logging`,
      lastError instanceof Error ? lastError.message : lastError,
    );
    await this.logOutboundEmail(options, { mode: 'smtp', delivered: false });
    this.logEmailFallback(options);
    return { delivered: false, mode: 'log' };
  }

  sendInvitationMail(options: {
    to: string;
    organizationName: string;
    inviterName: string;
    token: string;
    invitationId?: string;
    organizationId?: string;
  }): Promise<SendMailResult> {
    const acceptUrl = `${this.acceptLinkBase}/accept?token=${encodeURIComponent(
      options.token,
    )}&email=${encodeURIComponent(options.to)}`;
    const html = `
      <h2>You're invited to ${options.organizationName}</h2>
      <p>${options.inviterName} has invited you to join
      <strong>${options.organizationName}</strong> on the AI Knowledge Graph
      platform.</p>
      <p><a href="${acceptUrl}">Accept the invitation</a></p>
      <p>This link expires in 7 days. If you did not expect this invitation,
      you can safely ignore this email.</p>
    `;

    return this.send({
      to: options.to,
      subject: `Invitation to join ${options.organizationName}`,
      html,
      text: `You're invited to ${options.organizationName} by ${options.inviterName}. Accept here: ${acceptUrl}`,
      invitationId: options.invitationId,
      organizationId: options.organizationId,
    });
  }

  private async logOutboundEmail(
    options: SendMailOptions,
    result: { mode: 'smtp' | 'log'; delivered: boolean; messageId?: string },
  ): Promise<void> {
    try {
      await this.prisma.outboundEmail.create({
        data: {
          to: options.to,
          subject: options.subject,
          mode: result.mode,
          delivered: result.delivered,
          messageId: result.messageId,
          invitationId: options.invitationId,
          organizationId: options.organizationId,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Outbound email log write failed',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private logEmailFallback(options: SendMailOptions): void {
    this.logger.log(
      `[mail:log] to=${options.to} subject="${options.subject}" body="${(
        options.html || ''
      )
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()}"`,
    );
  }
}
