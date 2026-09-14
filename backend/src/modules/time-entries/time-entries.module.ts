import { Module } from '@nestjs/common';
import { AccessScopeService } from '../../common/auth/access-scope.service';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

@Module({
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService, AccessScopeService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
