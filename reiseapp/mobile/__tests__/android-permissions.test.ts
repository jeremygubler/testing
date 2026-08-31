/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * expo-task-manager delivers every batch of locations through a *persisted*
 * JobScheduler job, and Android refuses to persist a job unless the app holds
 * RECEIVE_BOOT_COMPLETED:
 *
 *   java.lang.IllegalArgumentException: Requested job cannot be persisted
 *   without holding android.permission.RECEIVE_BOOT_COMPLETED permission
 *       at expo.modules.taskManager.TaskManagerUtils.updateOrScheduleJob
 *       at ...LocationTaskConsumer.reportLocationsImmediately
 *
 * That is a native crash on the very first GPS fix, so the app dies the moment
 * tracking would start working — and neither expo-location nor
 * expo-task-manager declares the permission for us. Nothing in the JS test
 * suite or the Metro bundle can see this; only a device can, which is why the
 * declaration is pinned here.
 */

type AppConfig = { expo: { android?: { permissions?: string[] } } };

const config: AppConfig = JSON.parse(
  readFileSync(join(__dirname, '..', 'app.json'), 'utf8'),
) as AppConfig;

describe('android permissions', () => {
  it('declares RECEIVE_BOOT_COMPLETED for the background location task', () => {
    expect(config.expo.android?.permissions ?? []).toContain(
      'android.permission.RECEIVE_BOOT_COMPLETED',
    );
  });
});
