import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User, UserRole } from '../database/entities/user.entity';

type CreateUserInput = {
    email: string;
    passwordHash: string;
    role: UserRole;
};

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
    ) {}

    findByEmail(email: string) {
        return this.usersRepository.findOne({ where: { email } });
    }

    findById(id: string) {
        return this.usersRepository.findOne({ where: { id } });
    }

    async findByIdOrFail(id: string) {
        const user = await this.findById(id);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    create(input: CreateUserInput) {
        return this.usersRepository.save(this.usersRepository.create(input));
    }

    async findAll(page: number, limit: number, search?: string) {
        const where = search ? { email: ILike(`%${search}%`) } : {};

        const [users, total] = await this.usersRepository.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            data: users.map((u) => ({
                id: u.id,
                email: u.email,
                role: u.role,
                balance: u.balance ?? '0.00',
                createdAt: u.createdAt,
            })),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
