import { SetMetadata } from '@nestjs/common';
import { Role } from 'generated/prisma/enums';

export const RequiredRoles = (...roles: Role[]) => SetMetadata('roles', roles);
