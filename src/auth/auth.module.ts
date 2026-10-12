import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { RolesGuard } from './guards/roles.guard'
import { readJwtSecret } from './jwt-secret'

@Module({
  imports: [
    // Sin fallback: si falta JWT_SECRET, readJwtSecret lanza y Nest aborta el arranque.
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: readJwtSecret() }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
