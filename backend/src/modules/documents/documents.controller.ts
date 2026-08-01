import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../presentation/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '../../domain/entities/user.entity';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Upload a document' })
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: any) {
    return this.documentsService.create(dto, user.organizationId, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List documents' })
  findAll(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
    @Query('source') source?: string,
  ) {
    return this.documentsService.findAll(user.organizationId, {
      page,
      limit,
      status,
      source,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.documentsService.findById(id, user.organizationId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete document' })
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.documentsService.delete(id, user.organizationId);
  }

  @Post(':id/process')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Trigger document processing' })
  process(@Param('id') id: string) {
    return this.documentsService.processDocument(id);
  }
}
