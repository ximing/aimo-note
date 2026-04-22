import { Service } from 'typedi';
import { getDb } from '../db/connection.js';
import { syncAuditLogs, type NewSyncAuditLog } from '../db/schema/sync-audit-logs.js';
import { logger } from '../utils/logger.js';

/**
 * Audit event types
 */
export const AuditActions = {
  USER_REGISTER: 'user.register',
  USER_LOGIN: 'user.login',
  VAULT_CREATE: 'vault.create',
  DEVICE_REGISTER: 'device.register',
  SYNC_COMMIT: 'sync.commit',
  SYNC_PULL: 'sync.pull',
  SYNC_ACK: 'sync.ack',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

/**
 * Context for audit events - fields that may be available depending on the event
 */
export interface AuditContext {
  userId?: string | null;
  vaultId?: string | null;
  deviceId?: string | null;
  requestId?: string | null;
  status?: string;
  detail?: Record<string, unknown>;
}

/**
 * Audit service for logging events to the sync_audit_logs table.
 * Provides a unified entry point for all audit logging across the server.
 */
@Service()
export class AuditService {
  /**
   * Generic audit log method
   */
  async log(action: AuditAction, context: AuditContext = {}): Promise<void> {
    const db = getDb();

    const auditEntry: NewSyncAuditLog = {
      userId: context.userId ?? null,
      vaultId: context.vaultId ?? null,
      deviceId: context.deviceId ?? null,
      action,
      requestId: context.requestId ?? null,
      status: context.status ?? null,
      detailJson: context.detail ? JSON.stringify(context.detail) : null,
      createdAt: new Date(),
    };

    await db.insert(syncAuditLogs).values(auditEntry);

    logger.debug('Audit event logged', {
      action,
      userId: context.userId ?? undefined,
      vaultId: context.vaultId ?? undefined,
      deviceId: context.deviceId ?? undefined,
      requestId: context.requestId ?? undefined,
      status: context.status ?? undefined,
    });
  }

  /**
   * Log user registration event
   */
  async logRegister(
    userId: string,
    context: Omit<AuditContext, 'userId'> = {}
  ): Promise<void> {
    await this.log(AuditActions.USER_REGISTER, { ...context, userId });
  }

  /**
   * Log user login event
   */
  async logLogin(
    userId: string,
    context: Omit<AuditContext, 'userId'> = {}
  ): Promise<void> {
    await this.log(AuditActions.USER_LOGIN, { ...context, userId });
  }

  /**
   * Log vault creation event
   */
  async logVaultCreate(
    userId: string,
    vaultId: string,
    context: Omit<AuditContext, 'userId' | 'vaultId'> = {}
  ): Promise<void> {
    await this.log(AuditActions.VAULT_CREATE, { ...context, userId, vaultId });
  }

  /**
   * Log device registration event
   */
  async logDeviceRegister(
    userId: string,
    deviceId: string,
    context: Omit<AuditContext, 'userId' | 'deviceId'> = {}
  ): Promise<void> {
    await this.log(AuditActions.DEVICE_REGISTER, { ...context, userId, deviceId });
  }

  /**
   * Log sync commit event
   */
  async logSyncCommit(
    userId: string,
    vaultId: string,
    deviceId: string,
    requestId: string,
    context: Omit<AuditContext, 'userId' | 'vaultId' | 'deviceId' | 'requestId'> = {}
  ): Promise<void> {
    await this.log(AuditActions.SYNC_COMMIT, {
      ...context,
      userId,
      vaultId,
      deviceId,
      requestId,
    });
  }

  /**
   * Log sync pull event
   */
  async logSyncPull(
    userId: string,
    vaultId: string,
    deviceId: string,
    requestId: string,
    context: Omit<AuditContext, 'userId' | 'vaultId' | 'deviceId' | 'requestId'> = {}
  ): Promise<void> {
    await this.log(AuditActions.SYNC_PULL, {
      ...context,
      userId,
      vaultId,
      deviceId,
      requestId,
    });
  }

  /**
   * Log sync ack event
   */
  async logSyncAck(
    userId: string,
    vaultId: string,
    deviceId: string,
    requestId: string,
    context: Omit<AuditContext, 'userId' | 'vaultId' | 'deviceId' | 'requestId'> = {}
  ): Promise<void> {
    await this.log(AuditActions.SYNC_ACK, {
      ...context,
      userId,
      vaultId,
      deviceId,
      requestId,
    });
  }
}
