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
import { MeetingsService } from './meetings.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';

@ApiTags('Meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private meetingsService: MeetingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a meeting record' })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.meetingsService.create({
      ...dto,
      organizerId: user.id,
      organizationId: user.organizationId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List meetings' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser() user: any,
  ) {
    return this.meetingsService.findAll(user.organizationId, { page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get meeting details' })
  findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.findById(id, user.organizationId);
  }

  @Post(':id/summarize')
  @ApiOperation({ summary: 'Generate AI meeting summary' })
  summarize(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.generateSummary(id, user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete meeting' })
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetingsService.delete(id, user.organizationId);
  }
}
