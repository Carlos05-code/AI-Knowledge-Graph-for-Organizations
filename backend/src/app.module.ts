import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from './modules/auth/auth.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { GraphModule } from './modules/graph/graph.module';
import { ChatModule } from './modules/chat/chat.module';
import { SearchModule } from './modules/search/search.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { ExpertiseModule } from './modules/expertise/expertise.module';
import { GapsModule } from './modules/gaps/gaps.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { EventsModule } from './infrastructure/events/events.module';
import { LoggerModule } from './infrastructure/logger/logger.module';
import { MetricsModule } from './infrastructure/metrics/metrics.module';
import { Neo4jModule } from './infrastructure/graph/graph.module';
import { VectorModule } from './infrastructure/vector/vector.module';
import { AIModule } from './infrastructure/ai/ai.module';
import { ConnectorRegistryModule } from './infrastructure/connectors/connector-registry.module';
import { UploadModule } from './modules/upload/upload.module';
import { HealthController } from './presentation/health/health.controller';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './presentation/filters/http-exception.filter';
import { TransformInterceptor } from './presentation/interceptors/transform.interceptor';
import { LoggingInterceptor } from './presentation/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TerminusModule,
    DatabaseModule,
    Neo4jModule,
    CacheModule,
    QueueModule,
    StorageModule,
    LoggerModule,
    EventsModule,
    MetricsModule,
    VectorModule,
    AIModule,
    ConnectorRegistryModule,
    UploadModule,
    AuthModule,
    ConnectorsModule,
    DocumentsModule,
    GraphModule,
    ChatModule,
    SearchModule,
    MeetingsModule,
    NotificationsModule,
    AdminModule,
    PoliciesModule,
    ExpertiseModule,
    GapsModule,
    RecommendationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
