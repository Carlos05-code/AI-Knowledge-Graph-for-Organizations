import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseEvent } from './base.event';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private eventEmitter: EventEmitter2) {}

  async publish<T extends BaseEvent>(event: T): Promise<void> {
    this.logger.debug(
      `Publishing event: ${event.eventName} (${event.eventId})`,
    );
    this.eventEmitter.emit(event.eventName, event);
  }

  async publishAll<T extends BaseEvent>(events: T[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe(
    eventName: string,
    handler: (event: BaseEvent) => Promise<void>,
  ): void {
    this.eventEmitter.on(eventName, handler);
  }
}
