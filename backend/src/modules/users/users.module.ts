import { Module } from '@nestjs/common';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AccessScopeService],
  exports: [UsersService],
})
export class UsersModule {}
