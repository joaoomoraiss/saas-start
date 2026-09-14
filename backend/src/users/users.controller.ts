import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from 'src/auth/auth.guard';
import { VerifiedEmailGuard } from 'src/auth/verified-email.guard';
import { userSubject } from 'src/casl/cast-ability/cast-ability.service';
import { CheckPolicies } from 'src/casl/policies.decorator';
import { PoliciesGuard } from 'src/casl/policies.guard';
import { LIMITS } from 'src/common/throttle/limits';
import type { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { RequiredRoles } from 'src/role/role.decorator';
import { RoleGuard } from 'src/role/role.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
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
 * As rotas /profile, /password e /me vem ANTES de :id: o Nest casa na ordem de
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

  @Throttle(LIMITS.changePassword)
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
      request.sessionId,
    );
  }

  /**
   * Portabilidade (LGPD Art. 18). Sem VerifiedEmailGuard de proposito: o
   * direito de acesso aos proprios dados nao depende de confirmar e-mail.
   */
  @Throttle(LIMITS.exportData)
  @Get('me/export')
  @Header('Content-Disposition', 'attachment; filename="meus-dados.json"')
  exportMyData(@Req() request: AuthenticatedRequest) {
    return this.usersService.exportData(request.user.id);
  }

  /** Exclusao pelo proprio titular. Cancela a assinatura antes de apagar. */
  @Throttle(LIMITS.deleteAccount)
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMyAccount(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DeleteAccountDto,
  ) {
    await this.usersService.deleteOwnAccount(request.user.id, dto.password);
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
