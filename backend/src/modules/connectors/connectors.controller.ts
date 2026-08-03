import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConnectorsService } from './connectors.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../presentation/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '../../domain/entities/user.entity';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

@ApiTags('Connectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('connectors')
export class ConnectorsController {
  constructor(private connectorsService: ConnectorsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new connector' })
  create(
    @Body() dto: CreateConnectorDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.connectorsService.create(user.organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List connectors' })
  findAll(@CurrentUser() user: { organizationId: string }) {
    return this.connectorsService.findAll(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get connector details' })
  findById(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.connectorsService.findById(id, user.organizationId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update connector' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectorDto,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.connectorsService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete connector (soft)' })
  delete(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.connectorsService.delete(id, user.organizationId);
  }

  @Post(':id/test')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Test connector credentials' })
  test(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.connectorsService.testConnection(id, user.organizationId);
  }

  @Post(':id/sync')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Trigger connector sync' })
  sync(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.connectorsService.sync(id, user.organizationId);
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'Get sync run history' })
  getRuns(
    @Param('id') id: string,
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.connectorsService.getRunHistory(id, user.organizationId);
  }
}