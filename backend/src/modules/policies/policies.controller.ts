import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PoliciesService } from './policies.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../presentation/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '../../domain/entities/user.entity';

@ApiTags('Policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('policies')
export class PoliciesController {
  constructor(private policiesService: PoliciesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a policy' })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.policiesService.create({
      ...dto,
      organizationId: user.organizationId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List policies' })
  findAll(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('category') category?: string,
    @Query('active') active?: boolean,
  ) {
    return this.policiesService.findAll(user.organizationId, {
      page,
      limit,
      category,
      active,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search policies' })
  search(@Query('q') query: string, @CurrentUser() user: any) {
    return this.policiesService.searchByQuery(query, user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get policy details' })
  findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.policiesService.findById(id, user.organizationId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update policy' })
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.policiesService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete policy' })
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.policiesService.delete(id, user.organizationId);
  }
}
