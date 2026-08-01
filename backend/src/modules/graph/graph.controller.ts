import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';

@ApiTags('Knowledge Graph')
@Controller('graph')
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
  @ApiOperation({ summary: 'Execute raw Cypher query' })
  query(@Body() body: { query: string; params?: Record<string, unknown> }) {
    return this.neo4j.executeRaw(body.query, body.params);
  }
}
