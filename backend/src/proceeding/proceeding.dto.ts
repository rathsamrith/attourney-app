import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Story "Log objection": grounds are chosen from the standard list. */
export const OBJECTION_GROUNDS = [
  'relevance',
  'hearsay',
  'leading',
  'speculation',
  'compound',
  'asked_and_answered',
  'argumentative',
  'foundation',
  'privilege',
  'form',
] as const;
export type ObjectionGround = (typeof OBJECTION_GROUNDS)[number];

export class RaiseObjectionDto {
  @ApiProperty({ enum: OBJECTION_GROUNDS }) @IsIn(OBJECTION_GROUNDS) grounds: ObjectionGround;
  @ApiPropertyOptional() @IsOptional() @IsUUID() transcriptLineId?: string;
}

export class RuleObjectionDto {
  @ApiProperty({ enum: ['sustained', 'overruled'] }) @IsIn(['sustained', 'overruled']) ruling: 'sustained' | 'overruled';
}

export class ObjectionDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: OBJECTION_GROUNDS }) grounds: string;
  @ApiProperty() raisedByName: string;
  @ApiProperty({ enum: ['P', 'D', 'T'] }) raisedBySide: string;
  @ApiProperty({ nullable: true, type: Number }) lineSeq: number | null;
  @ApiProperty({ nullable: true, type: String }) lineText: string | null;
  @ApiProperty({ enum: ['pending', 'sustained', 'overruled'] }) ruling: string;
  @ApiProperty({ nullable: true, type: String }) ruledAt: string | null;
}

export class RequestContinuanceDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(2000) reason: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() proposedResumeAt?: string;
}

export class RuleContinuanceDto {
  @ApiProperty({ enum: ['granted', 'denied'] }) @IsIn(['granted', 'denied']) status: 'granted' | 'denied';
}

export class ContinuanceDto {
  @ApiProperty() id: string;
  @ApiProperty() requestedByName: string;
  @ApiProperty({ enum: ['P', 'D', 'T'] }) requestedBySide: string;
  @ApiProperty() reason: string;
  @ApiProperty({ nullable: true, type: String }) proposedResumeAt: string | null;
  @ApiProperty({ enum: ['requested', 'granted', 'denied'] }) status: string;
  @ApiProperty({ nullable: true, type: String }) ruledAt: string | null;
}

export class CaucusMemberDto {
  @ApiProperty() participantId: string;
  @ApiProperty() name: string;
}

export class CaucusRoomDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['P', 'D'] }) side: string;
  @ApiProperty() openedAt: string;
  @ApiProperty({ type: [CaucusMemberDto] }) members: CaucusMemberDto[];
  @ApiProperty() iAmIn: boolean;
}

const LINE_KINDS = ['q', 'a', 'colloquy', 'procedural'] as const;

export class AddTranscriptLineDto {
  @ApiPropertyOptional({ description: 'Participant speaking; omit for procedural lines.' })
  @IsOptional()
  @IsUUID()
  speakerId?: string;
  @ApiProperty({ enum: LINE_KINDS }) @IsIn(LINE_KINDS) kind: (typeof LINE_KINDS)[number];
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(10_000) text: string;
}

export class CorrectTranscriptLineDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(10_000) text: string;
}

export class TranscriptLineDto {
  @ApiProperty() id: string;
  @ApiProperty() seq: number;
  @ApiProperty({ nullable: true, type: String }) speakerName: string | null;
  @ApiProperty({ nullable: true, type: String }) speakerRole: string | null;
  @ApiProperty({ enum: LINE_KINDS }) kind: string;
  @ApiProperty() text: string;
  @ApiProperty() at: string;
}

export class MediaTokenRequestDto {
  @ApiProperty({ description: '"hearing" for the hearing room, or a caucus room id.' })
  @IsString()
  room: string;
}

export class MediaTokenDto {
  @ApiProperty() url: string;
  @ApiProperty() token: string;
  @ApiProperty() roomName: string;
}
