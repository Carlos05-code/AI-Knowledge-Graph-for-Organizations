import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';
import { AuditLogHandler } from './handlers/audit-log.handler';
import { NotificationHandler } from './handlers/notification.handler';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
  ],
  providers: [EventBusService, AuditLogHandler, NotificationHandler],
  exports: [EventBusService],
})
export class EventsModule {}
