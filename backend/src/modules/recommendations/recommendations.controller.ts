import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';

@ApiTags('Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get personalized recommendations' })
  getRecommendations(@CurrentUser() user: any) {
    return this.recommendationsService.getRecommendations(user.id, user.organizationId);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Get personalized feed' })
  getFeed(@CurrentUser() user: any) {
    return this.recommendationsService.getPersonalizedFeed(user.id, user.organizationId);
  }
}
