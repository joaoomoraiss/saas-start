import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { VerifiedEmailGuard } from 'src/auth/verified-email.guard';
import { userSubject } from 'src/casl/cast-ability/cast-ability.service';
import { CheckPolicies } from 'src/casl/policies.decorator';
import { PoliciesGuard } from 'src/casl/policies.guard';
import type { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { RequiredRoles } from 'src/role/role.decorator';
import { RoleGuard } from 'src/role/role.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Nenhuma rota aqui e publica. O cadastro de usuario final passa por
 * POST /auth/register, que dispara a confirmacao de e-mail; criar por aqui
 * pularia esse fluxo e por isso e restrito a ADMIN.
 *
 * Ownership e decidido pelas regras CASL em CastAbilityService, nao por
 * comparacoes de id espalhadas pelos handlers.
 *
 * As rotas /profile e /password vem ANTES de :id: o Nest casa na ordem de
 * declaracao, e depois de :id um GET /user/profile cairia no ParseUUIDPipe.
 */
@UseGuards(AuthGuard, RoleGuard, PoliciesGuard)
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Perfil do usuario do TOKEN. Sem exigencia de e-mail confirmado: e
   * justamente esta resposta (`isVerified`) que o frontend usa para exibir o
   * aviso de confirmacao pendente.
   */
  @Get('profile')
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.usersService.getProfile(request.user.id);
  }

  @UseGuards(VerifiedEmailGuard)
  @Patch('profile')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(request.user.id, dto);
  }

  @UseGuards(VerifiedEmailGuard)
  @Patch('password')
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      request.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

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
