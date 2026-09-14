import { Module } from '@nestjs/common';
import { TimesheetsModule } from '../timesheets/timesheets.module';
import { ClosingsController } from './closings.controller';
import { ClosingsService } from './closings.service';

@Module({
  imports: [TimesheetsModule],
  controllers: [ClosingsController],
  providers: [ClosingsService],
})
export class ClosingsModule {}
