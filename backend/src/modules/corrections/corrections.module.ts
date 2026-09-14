import { Module } from '@nestjs/common';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { CorrectionsController } from './corrections.controller';
import { CorrectionsService } from './corrections.service';

@Module({
  controllers: [CorrectionsController],
  providers: [CorrectionsService, AccessScopeService],
})
export class CorrectionsModule {}
