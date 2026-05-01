import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
