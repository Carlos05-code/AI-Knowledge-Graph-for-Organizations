import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExpertiseService } from './expertise.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';

@ApiTags('Expertise')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expertise')
export class ExpertiseController {
  constructor(private expertiseService: ExpertiseService) {}

  @Get('search')
  @ApiOperation({ summary: 'Find experts by topic' })
  findExperts(
    @CurrentUser() user: any,
    @Query('topic') topic: string,
    @Query('limit') limit?: string,
  ) {
    return this.expertiseService.findExperts(
      topic,
      user.organizationId,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get organization expertise summary' })
  getSummary(@CurrentUser() user: any) {
    return this.expertiseService.getExpertiseSummary(user.organizationId);
  }
}
