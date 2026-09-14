import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CaslModule } from 'src/casl/casl.module';
import { AuthGuard } from './auth.guard';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Global para que qualquer modulo possa usar `@UseGuards(AuthGuard)` sem
 * importar o AuthModule — que ja depende de UsersModule e criaria um ciclo.
 *
 * O JwtModule fica sem secret de proposito: cada token e assinado e
 * verificado pelo TokenService com o secret do seu proprio tipo, e um
 * default aqui reabriria a porta de um token servir para outro fim.
 */
@Global()
@Module({
  imports: [
    CaslModule,
    JwtModule.register({ signOptions: { algorithm: 'HS256' } }),
  ],
  providers: [TokenService, SessionService, AuthGuard],
  exports: [TokenService, SessionService, AuthGuard, JwtModule],
})
export class TokenModule {}
