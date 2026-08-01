export abstract class BaseEvent {
  abstract readonly eventName: string;
  readonly timestamp: Date;
  readonly eventId: string;

  constructor() {
    this.timestamp = new Date();
    this.eventId = crypto.randomUUID();
  }
}
