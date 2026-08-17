import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const expressReq = req as Request;
    return Promise.resolve(
      expressReq.ips.length ? expressReq.ips[0] : expressReq.ip || 'unknown',
    );
  }
}
