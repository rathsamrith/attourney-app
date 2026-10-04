import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class TagExhibitDto {
  @ApiProperty() @IsUUID() sessionId: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(300) title: string;
}

export class RuleExhibitDto {
  @ApiProperty() @IsUUID() sessionId: string;
  @ApiProperty({ enum: ['admitted', 'excluded'] }) @IsIn(['admitted', 'excluded']) ruling: 'admitted' | 'excluded';
}

export class PublishExhibitDto {
  @ApiProperty() @IsUUID() sessionId: string;
}

export class ExhibitDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'P-001 style once offered; a private label while tagged.' }) label: string;
  @ApiProperty() title: string;
  @ApiProperty() pages: number;
  @ApiProperty({ enum: ['P', 'D'] }) side: string;
  @ApiProperty({ enum: ['tagged', 'offered', 'admitted', 'excluded'] }) status: string;
  @ApiProperty({ nullable: true, type: String }) offeredAt: string | null;
  @ApiProperty({ nullable: true, type: String }) ruledAt: string | null;
  @ApiProperty() mine: boolean;
}

export class PublicationDto {
  @ApiProperty() publicationId: string;
  @ApiProperty() exhibitId: string;
  @ApiProperty() label: string;
  @ApiProperty() title: string;
  @ApiProperty() pages: number;
  @ApiProperty() publishedByName: string;
  @ApiProperty() startedAt: string;
}

export class SessionPublicationDto {
  @ApiProperty({ type: PublicationDto, nullable: true }) current: PublicationDto | null;
}
