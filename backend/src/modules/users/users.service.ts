import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UpdateProfileDto, UpdateUserDto } from './dto/update-user.dto';
import { PAGINATION_DEFAULTS } from '../../shared/constants';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      department: user.department,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      organizationId: user.organizationId,
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
          }
        : null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existing || !existing.isActive) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      include: { organization: true },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      department: user.department,
      role: user.role,
      isActive: user.isActive,
      organizationId: user.organizationId,
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
          }
        : null,
    };
  }

  async findMembers(
    organizationId: string,
    params: { page?: number; limit?: number; query?: string },
  ) {
    const page = params.page || PAGINATION_DEFAULTS.page;
    const limit = Math.min(
      params.limit || PAGINATION_DEFAULTS.limit,
      PAGINATION_DEFAULTS.maxLimit,
    );

    const where = {
      organizationId,
      deletedAt: null,
      ...(params.query
        ? {
            OR: [
              {
                firstName: {
                  contains: params.query,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastName: {
                  contains: params.query,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: { contains: params.query, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          title: true,
          department: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      },
    };
  }

  async updateMember(
    organizationId: string,
    userId: string,
    dto: UpdateUserDto,
    actorId: string,
  ) {
    if (
      userId === actorId &&
      (dto.role !== undefined || dto.isActive === false)
    ) {
      throw new BadRequestException(
        'Admins cannot demote or deactivate themselves',
      );
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !target ||
      target.organizationId !== organizationId ||
      target.deletedAt
    ) {
      throw new NotFoundException('User not found in organization');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    this.logger.log(
      `Member ${userId} updated by ${actorId}: ${JSON.stringify(dto)}`,
    );
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
