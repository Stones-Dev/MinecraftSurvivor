/**
 * Watches the save for changes made outside a run (eggs opened, upgrades bought, a new day) and keeps
 * missions and achievements current, toasting unlocks. Called every frame from main.ts; it only does
 * work when the save's `lastModified` moved or a minute passed (to catch midnight).
 */
import type { App } from '../app';
import { rewardText } from '../data/missions';
import { syncMeta } from '../systems/metaSync';
import type { MetaSync } from '../systems/metaSync';
import { pushToast } from './toast';

const RECHECK_SEC = 30;

/** Queue the toasts for what a sync (or a run end) changed. */
export function toastSync(r: Pick<MetaSync, 'unlocked' | 'missions' | 'autoClaimed'>): void {
  for (const m of r.missions) {
    if (m.completedNow) pushToast({ text: `Mission complete: ${m.text}`, icon: 'star' });
  }
  for (const a of r.unlocked) {
    pushToast({ text: `Achievement: ${a.name}`, icon: a.icon, color: '#ffd84a' });
  }
  const auto = rewardText(r.autoClaimed);
  if (auto) pushToast({ text: `Missions claimed: ${auto}`, icon: 'emerald' });
}

export function createMetaWatcher(app: App): (dt: number) => void {
  let lastMod = -1;
  let quiet = 0;
  let acc = 0;
  return (dt) => {
    acc += dt;
    if (acc < 0.5) return;
    quiet += acc;
    acc = 0;
    let save;
    try {
      save = app.data();
    } catch {
      return;
    }
    if (save.lastModified === lastMod && quiet < RECHECK_SEC) return;
    quiet = 0;
    const r = syncMeta(save, Date.now());
    if (r.changed) {
      app.store.save(save);
      toastSync(r);
    }
    lastMod = save.lastModified;
  };
}
