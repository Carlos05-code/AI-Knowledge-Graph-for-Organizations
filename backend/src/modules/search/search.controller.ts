import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Hybrid enterprise search' })
  search(
    @CurrentUser() user: any,
    @Query('q') query: string,
    @Query('mode') mode?: 'keyword' | 'semantic' | 'hybrid',
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.searchService.hybridSearch(query, user.organizationId, {
      mode,
      type,
      page,
      limit,
    });
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get search suggestions' })
  suggestions(@Query('q') query: string, @CurrentUser() user: any) {
    return this.searchService.getSearchSuggestions(query, user.organizationId);
  }
}
