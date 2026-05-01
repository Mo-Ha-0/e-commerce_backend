import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from 'src/auth/jwt-user';

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
        return request.user;
    },
);
