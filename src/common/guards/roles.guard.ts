import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { UserRole } from 'src/database/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtUser } from 'src/auth/jwt-user';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        const requiredRoles =
            this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) ?? [];

        if (requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest<{
            user?: JwtUser;
        }>();

        if (!request.user) {
            throw new UnauthorizedException('Login required');
        }

        return requiredRoles.includes(request.user.role);
    }
}
