import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { JwtAuthGuard } from '../../presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../presentation/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '../../domain/entities/user.entity';

@ApiTags('Knowledge Graph')
@Controller('graph')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GraphController {
  constructor(private neo4j: Neo4jService) {}

  @Get('nodes')
  @ApiOperation({ summary: 'Get graph nodes' })
  getNodes(@Query('type') type?: string, @Query('limit') limit?: number, @Query('skip') skip?: number) {
    return this.neo4j.queryNodes(type, limit || 50, skip || 0);
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get node by ID with relationships' })
  getNode(@Param('id') id: string) {
    return this.neo4j.findNodeById(id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search nodes' })
  searchNodes(@Query('q') query: string, @Query('type') type?: string) {
    return this.neo4j.searchNodes(query, type);
  }

  @Get('subgraph/:id')
  @ApiOperation({ summary: 'Get subgraph around a node' })
  getSubgraph(@Param('id') id: string, @Query('depth') depth?: number) {
    return this.neo4j.getSubgraph(id, depth || 2);
  }

  @Post('query')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Execute raw Cypher query (admin only)' })
  query(@Body() body: { query: string; params?: Record<string, unknown> }) {
    return this.neo4j.executeRaw(body.query, body.params);
  }
}
