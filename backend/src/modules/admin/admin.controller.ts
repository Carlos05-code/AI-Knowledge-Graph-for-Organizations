import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../presentation/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '../../domain/entities/user.entity';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get organization dashboard stats' })
  getDashboard(@CurrentUser() user: any) {
    return this.adminService.getDashboardStats(user.organizationId);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get audit logs' })
  getAuditLogs(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
  ) {
    return this.adminService.getAuditLogs(user.organizationId, { page, limit, entity, action });
  }

  @Get('health')
  @ApiOperation({ summary: 'Get system health' })
  getHealth() {
    return this.adminService.getSystemHealth();
  }
}
