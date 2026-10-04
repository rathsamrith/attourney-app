import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import type { AuthUser } from '../auth/current-user.js';
import { BlockedException } from '../common/blocked.exception.js';
import { loadSessionAccess } from '../common/session-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MediaTokenDto } from './proceeding.dto.js';

/**
 * Issues SFU (LiveKit) room tokens. Media flows browser to SFU and never through the API.
 * The hearing room admits admitted participants who are present or in sidebar; a caucus
 * room admits only participants currently in that room, which keeps caucus same-side.
 * No recording is ever configured, so caucus media never reaches the record.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async token(sessionId: string, room: string, user: AuthUser): Promise<MediaTokenDto> {
    const { me } = await loadSessionAccess(this.prisma, sessionId, user);
    let roomName: string;

    if (room === 'hearing') {
      if (!me.sworn || !['present', 'sidebar'].includes(me.presence)) {
        throw new BlockedException('Video opens once you are admitted and present in the hearing room.', {
          code: 'media.notPresent',
        });
      }
      roomName = `hearing-${sessionId}`;
    } else {
      const caucus = await this.prisma.caucusRoom.findFirst({ where: { id: room, sessionId, side: user.side, closedAt: null } });
      if (!caucus) throw new NotFoundException('Caucus room not found.');
      const last = await this.prisma.presenceEvent.findFirst({ where: { participantId: me.id }, orderBy: { at: 'desc' } });
      if (me.presence !== 'caucus' || last?.caucusRoomId !== caucus.id) {
        throw new BlockedException('Join the caucus room first.', { code: 'media.notInCaucus' });
      }
      roomName = `caucus-${caucus.id}`;
    }

    const at = new AccessToken(this.config.getOrThrow('LIVEKIT_API_KEY'), this.config.getOrThrow('LIVEKIT_API_SECRET'), {
      identity: me.id,
      name: user.name,
      ttl: '2h',
    });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
    return { url: this.config.getOrThrow('LIVEKIT_URL'), token: await at.toJwt(), roomName };
  }
}
