import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { AuditEvent } from '../generated/prisma/client.js';

/** What clients receive over Socket.IO: enough to know which queries to refetch, nothing more. */
export interface DomainEvent {
  seq: string;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  matterId: string | null;
  sessionId: string | null;
  visibilitySide: 'P' | 'D' | 'T' | null;
}

export function toDomainEvent(e: AuditEvent): DomainEvent {
  return {
    seq: e.seq.toString(),
    at: e.at.toISOString(),
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    matterId: e.matterId,
    sessionId: e.sessionId,
    visibilitySide: e.visibilitySide,
  };
}

/** In-process bus for committed events. Only CommandRunner publishes, after commit. */
@Injectable()
export class DomainEvents {
  private readonly emitter = new EventEmitter();

  publish(event: DomainEvent) {
    this.emitter.emit('event', event);
  }

  subscribe(listener: (event: DomainEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
