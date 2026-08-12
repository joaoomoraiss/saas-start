import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PrismaService } from './../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 12;

/** Estreita o `unknown` do catch ate o codigo de erro do Prisma. */
function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === code
  );
}

@Injectable()
export class UsersService {
  constructor(private prismaService: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    //check if user with email already exists
    const existingUser = await this.prismaService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new UnprocessableEntityException(
        'User with this email already exists',
      );
    }

    //create user
    return this.prismaService.user.create({
      data: {
        email: createUserDto.email,
        password: await this.hash(createUserDto.password),
        role: 'USER',
      },
    });
  }

  findAll() {
    return this.prismaService.user.findMany();
  }

  async findOne(id: string) {
    //check if user exists
    const user = await this.prismaService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id);

    const data: { password?: string } = {};

    // Only hash password if provided
    if (updateUserDto.password) {
      data.password = await this.hash(updateUserDto.password);
    }

    return this.prismaService.user.update({ where: { id }, data });
  }

  /** Fluxo de confirmacao de e-mail. Nao exposto via PATCH. */
  async markAsVerified(id: string) {
    return this.prismaService.user.update({
      where: { id },
      data: { isVerified: true },
    });
  }

  async setPassword(id: string, plainPassword: string) {
    return this.prismaService.user.update({
      where: { id },
      data: { password: await this.hash(plainPassword) },
    });
  }

  async remove(id: string) {
    //check if user exists
    await this.findOne(id);

    try {
      return await this.prismaService.user.delete({ where: { id } });
    } catch (err: unknown) {
      // Prisma throws P2025 when record to delete does not exist
      if (isPrismaError(err, 'P2025')) {
        throw new NotFoundException('User not found');
      }
      throw err;
    }
  }

  findByEmail(email: string) {
    return this.prismaService.user.findUnique({
      where: { email },
    });
  }

  /**
   * Unico caminho que traz o hash de senha, usado apenas na verificacao de
   * login. Todo o resto usa findByEmail, que respeita o omit global.
   */
  findByEmailForAuth(email: string) {
    return this.prismaService.user.findUnique({
      where: { email },
      omit: { password: false },
    });
  }

  private hash(plainPassword: string) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }
}
