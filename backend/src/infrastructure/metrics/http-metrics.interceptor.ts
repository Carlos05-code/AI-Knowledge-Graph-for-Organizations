import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Counter, Histogram, register } from 'prom-client';
import { Request, Response } from 'express';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const route = (req.route?.path || req.path) as string;
    const method = req.method;
    const start = process.hrtime();

    return next.handle().pipe(
      tap({
        next: () => this.record(method, route, res.statusCode, start),
        error: () => this.record(method, route, res.statusCode || 500, start),
      }),
    );
  }

  private record(
    method: string,
    route: string,
    status: number,
    start: [number, number],
  ) {
    const elapsed = start[0] + start[1] / 1e9;
    const labels = {
      method,
      route: route || 'unknown',
      status: String(status),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, elapsed);
  }
}
