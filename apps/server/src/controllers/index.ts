import { AuthController } from './v1/auth.controller.js';
import { UserController } from './v1/user.controller.js';
import { VaultController } from './v1/vault.controller.js';
import { DeviceController } from './v1/device.controller.js';
import { SyncController } from './v1/sync.controller.js';
import { SnapshotController } from './v1/snapshot.controller.js';

export const controllers = [
  AuthController,
  UserController,
  VaultController,
  DeviceController,
  SyncController,
  SnapshotController,
];

export { AuthController } from './v1/auth.controller.js';
export { UserController } from './v1/user.controller.js';
export { VaultController } from './v1/vault.controller.js';
export { DeviceController } from './v1/device.controller.js';
export { SyncController } from './v1/sync.controller.js';
export { SnapshotController } from './v1/snapshot.controller.js';