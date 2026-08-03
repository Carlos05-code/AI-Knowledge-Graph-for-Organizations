import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GapsService } from './gaps.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../presentation/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '../../domain/entities/user.entity';

@ApiTags('Knowledge Gaps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gaps')
export class GapsController {
  constructor(private gapsService: GapsService) {}

  @Get()
  @ApiOperation({ summary: 'List detected knowledge gaps' })
  getGaps(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('resolved') resolved?: string,
  ) {
    return this.gapsService.getGaps(user.organizationId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      severity,
      category,
      resolved: resolved === undefined ? undefined : resolved === 'true',
    });
  }

  @Post('detect')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Run knowledge gap detection' })
  detect(@CurrentUser() user: any) {
    return this.gapsService.detectGaps(user.organizationId);
  }

  @Post(':id/resolve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark gap as resolved' })
  resolve(@Param('id') id: string) {
    return this.gapsService.resolveGap(id);
  }
}
