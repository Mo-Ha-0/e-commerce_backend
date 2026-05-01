import { UserRole } from '../database/entities/user.entity';

export type JwtUser = {
    userId: string;
    email: string;
    role: UserRole;
};
