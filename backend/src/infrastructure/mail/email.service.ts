import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
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

  constructor(private config: ConfigService) {
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

  async send(options: SendMailOptions): Promise<SendMailResult> {
    if (!this.transporter) {
      this.logger.log(
        `[mail:log] to=${options.to} subject="${options.subject}" body="${(
          options.html || ''
        )
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()}"`,
      );
      return { delivered: false, mode: 'log' };
    }

    try {
      const from =
        this.config.get('MAIL_FROM') || 'AI Knowledge Graph <noreply@localhost>';
      const result = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || '',
      });
      return { delivered: true, mode: 'smtp', messageId: result.messageId };
    } catch (error) {
      this.logger.error(
        `Email to ${options.to} failed - falling back to logging`,
        error instanceof Error ? error.message : error,
      );
      this.logger.log(
        `[mail:log] to=${options.to} subject="${options.subject}" body="${(
          options.html || ''
        )
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()}"`,
      );
      return { delivered: false, mode: 'log' };
    }
  }

  sendInvitationMail(options: {
    to: string;
    organizationName: string;
    inviterName: string;
    token: string;
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
    });
  }
}