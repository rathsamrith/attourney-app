import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { DomainEvents, type DomainEvent } from '../audit/domain-events.js';
import type { AuthUser } from '../auth/current-user.js';
import { TokenVerifier } from '../auth/token-verifier.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const room = (sessionId: string) => `session:${sessionId}`;

/**
 * Pushes committed events to participants of a session. Clients use them to
 * refetch; the payload never carries content that the REST API would filter.
 */
@WebSocketGateway({
  cors: { origin: (origin: string, cb: (e: Error | null, ok?: boolean) => void) => cb(null, origin === process.env.WEB_ORIGIN) },
})
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private unsubscribe?: () => void;

  constructor(
    private readonly verifier: TokenVerifier,
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.events.subscribe((e) => void this.fanOut(e));
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  async handleConnection(socket: Socket) {
    try {
      socket.data.user = await this.verifier.verify(socket.handshake.auth?.token as string | undefined);
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('session:join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { sessionId?: string }) {
    const user = socket.data.user as AuthUser | undefined;
    if (!user || typeof body?.sessionId !== 'string') return { ok: false };
    const participant = await this.prisma.participant.findFirst({
      where: { sessionId: body.sessionId, userId: user.id },
      select: { id: true },
    });
    if (!participant) return { ok: false };
    await socket.join(room(body.sessionId));
    return { ok: true };
  }

  @SubscribeMessage('session:leave')
  async leave(@ConnectedSocket() socket: Socket, @MessageBody() body: { sessionId?: string }) {
    if (typeof body?.sessionId === 'string') await socket.leave(room(body.sessionId));
    return { ok: true };
  }

  private async fanOut(event: DomainEvent) {
    if (!event.sessionId) return;
    try {
      if (!event.visibilitySide) {
        this.server.to(room(event.sessionId)).emit('event', event);
        return;
      }
      // Side-restricted events (R7) go only to sockets of that side.
      const sockets = await this.server.in(room(event.sessionId)).fetchSockets();
      for (const s of sockets) {
        if ((s.data.user as AuthUser | undefined)?.side === event.visibilitySide) s.emit('event', event);
      }
    } catch (err) {
      this.logger.error('Event fan-out failed', err as Error);
    }
  }
}
