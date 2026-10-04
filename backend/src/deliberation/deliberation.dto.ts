import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CHOICES, type Choice } from './ballot-crypto.js';

export class CastBallotDto {
  @ApiProperty({ enum: CHOICES }) @IsIn(CHOICES) choice: Choice;
}

export class RevealedVoteDto {
  @ApiProperty() panelistName: string;
  @ApiProperty({ enum: CHOICES }) choice: string;
}

export class RevealDto {
  @ApiProperty({ enum: [...CHOICES, 'no_majority'] }) outcome: string;
  @ApiProperty({ type: [RevealedVoteDto] }) votes: RevealedVoteDto[];
  @ApiProperty() revealedAt: string;
}

export class DeliberationDto {
  @ApiProperty() panelSize: number;
  @ApiProperty() sealedCount: number;
  @ApiProperty() iAmPanelist: boolean;
  @ApiProperty({ enum: ['none', 'draft', 'sealed'] }) myStatus: 'none' | 'draft' | 'sealed';
  @ApiProperty({ enum: CHOICES, nullable: true, type: String }) myDraftChoice: string | null;
  @ApiProperty({ type: RevealDto, nullable: true }) revealed: RevealDto | null;
}
