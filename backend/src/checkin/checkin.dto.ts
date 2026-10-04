import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class IdentityAttemptDto {
  @ApiProperty({ enum: ['biometric', 'certificate'] })
  @IsIn(['biometric', 'certificate'])
  method: 'biometric' | 'certificate';

  @ApiProperty({ description: 'Selfie as a data URL for biometric, or a PEM certificate.' })
  @IsString()
  @MinLength(1)
  @MaxLength(8_000_000)
  evidence: string;
}

export class ManualVerificationDto {
  @ApiProperty({ description: 'The identity document the officer checked on camera, e.g. "Passport N1234567".' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  documentChecked: string;
}

export class IdentityResultDto {
  @ApiProperty() passed: boolean;
  @ApiProperty() attemptNo: number;
  @ApiProperty() attemptsLeft: number;
  @ApiProperty({ nullable: true, type: Number }) score: number | null;
}

export class CheckinStatusDto {
  @ApiProperty() participantId: string;
  @ApiProperty({ enum: ['pending', 'verified', 'failed'] }) verification: string;
  @ApiProperty() attemptsUsed: number;
  @ApiProperty() maxAttempts: number;
  @ApiProperty({ description: 'Oath text version to show; the frontend holds the translated text.' }) oathTextVersion: string;
  @ApiProperty() oathAffirmed: boolean;
  @ApiProperty({ description: 'Admitted to the hearing room; sworn time accrues from here.' }) admitted: boolean;
  @ApiProperty({ enum: ['lobby', 'present', 'sidebar', 'caucus', 'absent'] }) presence: string;
}

export class QueueEntryDto {
  @ApiProperty() participantId: string;
  @ApiProperty() name: string;
  @ApiProperty() sessionRole: string;
  @ApiProperty() side: string;
  @ApiProperty({ enum: ['pending', 'verified', 'failed'] }) verification: string;
  @ApiProperty() attemptsUsed: number;
  @ApiProperty() oathAffirmed: boolean;
}

export class CheckinQueueDto {
  @ApiProperty({ type: [QueueEntryDto], description: 'Failed automated checks waiting for manual verification.' })
  manualVerification: QueueEntryDto[];
  @ApiProperty({ type: [QueueEntryDto], description: 'Verified and sworn, waiting in the lobby to be admitted.' })
  awaitingAdmission: QueueEntryDto[];
  @ApiProperty({ type: [QueueEntryDto], description: 'Still checking in.' })
  inProgress: QueueEntryDto[];
}
