import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session } from 'neo4j-driver';

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Record<string, unknown>;
  weight?: number;
}

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Neo4jService.name);
  private driver!: Driver;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const uri = this.config.get('NEO4J_URI', 'bolt://localhost:7687');
    const user = this.config.get('NEO4J_USER', 'neo4j');
    const password = this.config.get('NEO4J_PASSWORD', 'neo4j-password');

    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      await this.driver.verifyConnectivity();
      this.logger.log('Connected to Neo4j');
    } catch (error) {
      this.logger.warn(
        `Neo4j unavailable at ${uri} — graph features disabled. Start Neo4j and restart to enable.`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  async onModuleDestroy() {
    await this.driver?.close();
    this.logger.log('Disconnected from Neo4j');
  }

  getSession(): Session {
    return this.driver.session();
  }

  async createNode(node: GraphNode): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `MERGE (n:${node.type} { id: $id })
         SET n.name = $name, n += $properties`,
        { id: node.id, name: node.name, properties: node.properties || {} },
      );
    } finally {
      await session.close();
    }
  }

  async createEdge(edge: GraphEdge): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `MATCH (a { id: $sourceId })
         MATCH (b { id: $targetId })
         MERGE (a)-[r:${edge.type}]->(b)
         SET r += $properties
         ${edge.weight ? 'SET r.weight = $weight' : ''}`,
        {
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          properties: edge.properties || {},
          weight: edge.weight,
        },
      );
    } finally {
      await session.close();
    }
  }

  async queryNodes(type?: string, limit = 50, skip = 0): Promise<any[]> {
    const session = this.getSession();
    try {
      const typeFilter = type ? `:${type}` : '';
      const result = await session.run(
        `MATCH (n${typeFilter})
         RETURN n
         ORDER BY n.name
         SKIP $skip LIMIT $limit`,
        { skip, limit },
      );
      return result.records.map((r) => r.get('n').properties);
    } finally {
      await session.close();
    }
  }

  async findNodeById(id: string): Promise<any> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (n { id: $id })
         OPTIONAL MATCH (n)-[r]-(connected)
         RETURN n, collect({type: type(r), direction: startNode(r).id = $id ? 'out' : 'in', node: connected}) as relationships`,
        { id },
      );
      if (result.records.length === 0) return null;
      const record = result.records[0];
      return {
        node: record.get('n').properties,
        relationships: record.get('relationships'),
      };
    } finally {
      await session.close();
    }
  }

  async searchNodes(query: string, type?: string, limit = 20): Promise<any[]> {
    const session = this.getSession();
    try {
      const typeFilter = type ? `:${type}` : '';
      const result = await session.run(
        `MATCH (n${typeFilter})
         WHERE n.name CONTAINS $query OR n.id CONTAINS $query
         RETURN n
         LIMIT $limit`,
        { query, limit },
      );
      return result.records.map((r) => r.get('n').properties);
    } finally {
      await session.close();
    }
  }

  async deleteNode(id: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `MATCH (n { id: $id })
         DETACH DELETE n`,
        { id },
      );
    } finally {
      await session.close();
    }
  }

  async getSubgraph(nodeId: string, depth = 2): Promise<any> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (n { id: $id })
         CALL apoc.path.subgraphAll(n, {maxLevel: $depth})
         YIELD nodes, relationships
         RETURN nodes, relationships`,
        { id: nodeId, depth },
      );
      if (result.records.length === 0) return { nodes: [], relationships: [] };
      const record = result.records[0];
      return {
        nodes: record.get('nodes').map((n: any) => n.properties),
        relationships: record.get('relationships').map((r: any) => ({
          sourceId: r.start,
          targetId: r.end,
          type: r.type,
          properties: r.properties,
        })),
      };
    } finally {
      await session.close();
    }
  }

  async executeRaw(
    query: string,
    params?: Record<string, unknown>,
  ): Promise<any> {
    const session = this.getSession();
    try {
      const result = await session.run(query, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }
}
