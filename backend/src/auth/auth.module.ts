import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { TokenVerifier } from './token-verifier.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [TokenVerifier, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [TokenVerifier],
})
export class AuthModule {}
