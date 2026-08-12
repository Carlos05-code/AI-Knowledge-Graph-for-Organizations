import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../../infrastructure/mail/email.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { UserRole } from '../../domain/entities/user.entity';

const DEFAULT_EXPIRES_IN_DAYS = 7;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  async create(
    organizationId: string,
    invitedById: string,
    dto: CreateInvitationDto,
  ) {
    const email = dto.email.toLowerCase();

    const existingUser = await this.prisma.user.findFirst({
      where: { email, organizationId },
    });
    if (existingUser) {
      throw new ConflictException(
        'A user with this email already belongs to the organization',
      );
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { email, organizationId, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException(
        'A pending invitation already exists for this email',
      );
    }

    const expiresInDays = dto.expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        organizationId,
        invitedById,
        role: dto.role ?? 'USER',
        token: crypto.randomUUID(),
        expiresAt,
      },
    });

    try {
      const [organization, inviter] = await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
        this.prisma.user.findUnique({
          where: { id: invitedById },
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        }),
      ]);
      const inviterName =
        inviter && (inviter.firstName || inviter.lastName)
          ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim()
          : inviter?.email || 'An administrator';
      await this.emailService.sendInvitationMail({
        to: email,
        organizationName: organization?.name || 'your organization',
        inviterName,
        token: invitation.token,
      });
    } catch (error) {
      this.logger.warn(
        `Invitation email could not be queued`,
        error instanceof Error ? error.message : error,
      );
    }

    return invitation;
  }

  async findAll(
    organizationId: string,
    params: { page: number; limit: number; status?: string },
  ) {
    const where: any = { organizationId };
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          invitedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.invitation.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
        hasNext: params.page * params.limit < total,
        hasPrevious: params.page > 1,
      },
    };
  }

  async revoke(organizationId: string, id: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, organizationId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Only pending invitations can be revoked');
    }

    return this.prisma.invitation.update({
      where: { id },
      data: { status: 'REVOKED', updatedAt: new Date() },
    });
  }

  async accept(dto: AcceptInvitationDto) {
    const email = dto.email.toLowerCase();
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
    });

    if (!invitation || invitation.email !== email) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Invitation is no longer valid');
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const createdUser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          keycloakId: crypto.randomUUID(),
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      return created;
    });

    await this.notificationsService.create({
      userId: invitation.invitedById,
      type: 'INVITATION_ACCEPTED',
      title: 'Invitation accepted',
      message: `${dto.firstName} ${dto.lastName} (${email}) accepted your invitation.`,
      data: { invitationId: invitation.id, userId: createdUser.id },
    });

    return createdUser;
  }
}
