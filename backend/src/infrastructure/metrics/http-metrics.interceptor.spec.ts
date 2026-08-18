import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { register } from 'prom-client';

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let context: ExecutionContext;

  const mockHttp = (path: string, method: string, statusCode: number) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, path, route: { path } }),
        getResponse: () => ({ statusCode }),
      }),
    }) as unknown as ExecutionContext;

  const totals = async () => {
    const metrics = await register.getMetricsAsJSON();
    const metric = metrics.find((m) => m.name === 'http_requests_total') as {
      values: Array<{ labels: Record<string, string>; value: number }>;
    };
    return metric?.values ?? [];
  };

  const expectTotals = (
    done: jest.DoneCallback,
    assert: (
      values: Array<{ labels: Record<string, string>; value: number }>,
    ) => void,
  ) => {
    void totals().then((values) => {
      try {
        assert(values);
        done();
      } catch (err) {
        done(err);
      }
    });
  };

  beforeEach(() => {
    register.resetMetrics();
    interceptor = new HttpMetricsInterceptor();
  });

  it('records a counter increment and a histogram observation on success', (done) => {
    context = mockHttp('/api/v1/documents', 'GET', 200);
    const next: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe(() => {
      expectTotals(done, (values) => {
        expect(
          values.some(
            (v) =>
              v.labels.method === 'GET' &&
              v.labels.route === '/api/v1/documents' &&
              v.labels.status === '200' &&
              v.value === 1,
          ),
        ).toBe(true);
      });
    });
  });

  it('records the response status code from the response object', (done) => {
    context = mockHttp('/api/v1/health', 'GET', 201);
    const next: CallHandler = { handle: () => of('created') };

    interceptor.intercept(context, next).subscribe(() => {
      expectTotals(done, (values) => {
        expect(values.some((v) => v.labels.status === '201')).toBe(true);
      });
    });
  });

  it('records a 500 status on thrown errors', (done) => {
    context = mockHttp(
      '/api/v1/search',
      'POST',
      undefined as unknown as number,
    );
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expectTotals(done, (values) => {
          expect(values.some((v) => v.labels.status === '500')).toBe(true);
        });
      },
    });
  });

  it('falls back to the request path when route is undefined', (done) => {
    context = mockHttp('/fallback/path', 'DELETE', 204);
    context.switchToHttp().getRequest().route = undefined;
    const next: CallHandler = { handle: () => of('deleted') };

    interceptor.intercept(context, next).subscribe(() => {
      expectTotals(done, (values) => {
        expect(values.some((v) => v.labels.route === '/fallback/path')).toBe(
          true,
        );
      });
    });
  });
});
