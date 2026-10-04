import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const RECORD_STATES = ['off', 'open', 'recess', 'closed'] as const;
type RecordStateValue = (typeof RECORD_STATES)[number];
const SESSION_ROLES = ['presiding', 'panelist', 'counsel', 'witness', 'officer', 'reporter'];

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
