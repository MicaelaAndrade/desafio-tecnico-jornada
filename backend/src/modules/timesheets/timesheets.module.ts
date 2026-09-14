import { Module } from '@nestjs/common';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';

@Module({
  controllers: [TimesheetsController],
  providers: [TimesheetsService, AccessScopeService],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}
