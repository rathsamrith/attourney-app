import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const RECORD_STATES = ['off', 'open', 'recess', 'closed'] as const;
type RecordStateValue = (typeof RECORD_STATES)[number];
const SESSION_ROLES = ['presiding', 'panelist', 'counsel', 'witness', 'officer', 'reporter'];
const FORUMS = ['deposition', 'arbitration', 'regulatory'] as const;

export class SetRecordStateDto {
  @ApiProperty({ enum: RECORD_STATES })
  @IsIn(RECORD_STATES)
  state: RecordStateValue;
}

const OFFICER_PRESENCE = ['present', 'sidebar', 'absent'] as const;

export class SetPresenceDto {
  @ApiProperty({ enum: OFFICER_PRESENCE })
  @IsIn(OFFICER_PRESENCE)
  state: (typeof OFFICER_PRESENCE)[number];
}

export class ParticipantDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['adj', 'counsel', 'officer', 'witness'] }) role: string;
  @ApiProperty({ enum: ['P', 'D', 'T'] }) side: string;
  @ApiProperty({ enum: SESSION_ROLES }) sessionRole: string;
  @ApiProperty({ enum: ['pending', 'verified', 'failed'] }) verification: string;
  @ApiProperty({ enum: ['lobby', 'present', 'sidebar', 'caucus', 'absent'] }) presence: string;
  @ApiProperty() sworn: boolean;
  @ApiProperty({ description: 'Computed by the server from presence and record events (R2).' }) swornSeconds: number;
}

export class SessionSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() matterId: string;
  @ApiProperty() caption: string;
  @ApiProperty() docketNo: string;
  @ApiProperty({ enum: ['deposition', 'arbitration', 'regulatory'] }) forum: string;
  @ApiProperty() dayNo: number;
  @ApiProperty() startsAt: string;
  @ApiProperty({ enum: RECORD_STATES }) recordState: RecordStateValue;
  @ApiProperty({ enum: SESSION_ROLES }) mySessionRole: string;
}

export class SessionDetailDto extends SessionSummaryDto {
  @ApiProperty() myParticipantId: string;
  @ApiProperty({ type: [ParticipantDto] }) participants: ParticipantDto[];
}

// ---------- scheduling ----------

export class NewMatterDto {
  @ApiProperty() @IsString() @MinLength(1) caption: string;
  @ApiProperty() @IsString() @MinLength(1) docketNo: string;
  @ApiProperty({ enum: FORUMS }) @IsIn(FORUMS) forum: (typeof FORUMS)[number];
}

export class ScheduleParticipantDto {
  @ApiProperty() @IsUUID() userId: string;
  @ApiProperty({ enum: SESSION_ROLES }) @IsIn(SESSION_ROLES) sessionRole: string;
}

export class RecurrenceDto {
  @ApiProperty({ minimum: 1, maximum: 20, description: 'Number of sessions (days) to create.' })
  @IsInt() @Min(1) @Max(20)
  count: number;

  @ApiProperty({ minimum: 1, maximum: 90, description: 'Days between sessions.' })
  @IsInt() @Min(1) @Max(90)
  everyDays: number;
}

export class ScheduleSessionDto {
  @ApiPropertyOptional({ description: 'Existing matter to schedule under.' })
  @IsOptional() @IsUUID()
  matterId?: string;

  @ApiPropertyOptional({ type: NewMatterDto, description: 'A new matter to open (when matterId is absent).' })
  @IsOptional() @ValidateNested() @Type(() => NewMatterDto)
  matter?: NewMatterDto;

  @ApiProperty({ description: 'Start of the first session (ISO 8601).' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({ type: [ScheduleParticipantDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScheduleParticipantDto)
  participants: ScheduleParticipantDto[];

  @ApiPropertyOptional({ type: RecurrenceDto, description: 'Create a recurring series instead of one session.' })
  @IsOptional() @ValidateNested() @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}

export class ScheduledSessionDto {
  @ApiProperty() id: string;
  @ApiProperty() dayNo: number;
  @ApiProperty() startsAt: string;
}

export class ScheduleResultDto {
  @ApiProperty() matterId: string;
  @ApiProperty() docketNo: string;
  @ApiProperty() matterCreated: boolean;
  @ApiProperty({ type: [ScheduledSessionDto] }) sessions: ScheduledSessionDto[];
}
