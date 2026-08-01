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
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('resolved') resolved?: boolean,
  ) {
    return this.gapsService.getGaps(user.organizationId, {
      page,
      limit,
      severity,
      category,
      resolved,
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
