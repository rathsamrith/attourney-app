import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DocketQuery {
  @ApiPropertyOptional({ description: 'Any date in the week; defaults to today. Weeks start on Monday.' })
  @IsOptional()
  @IsDateString()
  weekOf?: string;
}

export class MetricsQuery {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export const SEAL_STATUSES = ['in_progress', 'errata_open', 'ready_to_lock', 'locked', 'exported'] as const;

export class DocketSessionDto {
  @ApiProperty() id: string;
  @ApiProperty() caption: string;
  @ApiProperty() docketNo: string;
  @ApiProperty() forum: string;
  @ApiProperty() dayNo: number;
  @ApiProperty() startsAt: string;
  @ApiProperty({ enum: ['off', 'open', 'recess', 'closed'] }) recordState: string;
  @ApiProperty({ enum: SEAL_STATUSES }) sealStatus: (typeof SEAL_STATUSES)[number];
}

export class DocketDayDto {
  @ApiProperty({ description: 'YYYY-MM-DD (UTC)' }) date: string;
  @ApiProperty({ type: [DocketSessionDto] }) sessions: DocketSessionDto[];
}

export class DocketWeekDto {
  @ApiProperty() weekStart: string;
  @ApiProperty({ type: [DocketDayDto] }) days: DocketDayDto[];
}

export class MetricDto {
  @ApiProperty({ enum: ['verificationPassRate', 'objectionsPerSession', 'continuanceGrantRate', 'meanHoursToHashLock'] })
  key: string;
  @ApiProperty({ nullable: true, type: Number, description: 'null when the denominator is 0' }) value: number | null;
  @ApiProperty() numerator: number;
  @ApiProperty() denominator: number;
  @ApiProperty() periodFrom: string;
  @ApiProperty() periodTo: string;
}
