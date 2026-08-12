import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { userSubject } from 'src/casl/cast-ability/cast-ability.service';
import { CheckPolicies } from 'src/casl/policies.decorator';
import { PoliciesGuard } from 'src/casl/policies.guard';
import { RequiredRoles } from 'src/role/role.decorator';
import { RoleGuard } from 'src/role/role.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Nenhuma rota aqui e publica. O cadastro de usuario final passa por
 * POST /auth/register, que dispara a confirmacao de e-mail; criar por aqui
 * pularia esse fluxo e por isso e restrito a ADMIN.
 *
 * Ownership e decidido pelas regras CASL em CastAbilityService, nao por
 * comparacoes de id espalhadas pelos handlers.
 */
@UseGuards(AuthGuard, RoleGuard, PoliciesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequiredRoles('ADMIN')
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @RequiredRoles('ADMIN')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @CheckPolicies((ability, req) =>
    ability.can('read', userSubject(req.params.id)),
  )
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @CheckPolicies((ability, req) =>
    ability.can('update', userSubject(req.params.id)),
  )
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @RequiredRoles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
