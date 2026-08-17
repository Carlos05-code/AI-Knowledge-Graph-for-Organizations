import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
import { UserRole } from '../../domain/entities/user.entity';

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { user } = request;
    if (!user) throw new ForbiddenException('No user found');

    // VIEWER is strictly read-only: any non-read HTTP method is denied,
    // regardless of @Roles annotations (VIEWER is not listed anywhere).
    if (
      user.role === UserRole.VIEWER &&
      !READ_METHODS.includes(request.method)
    ) {
      throw new ForbiddenException('VIEWER role is read-only');
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}
