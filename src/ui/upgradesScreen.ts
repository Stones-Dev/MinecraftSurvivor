import type { App } from '../app';
import type { Screen } from './router';

/** Stub: replaced by the real upgrades screen. */
export function upgradesScreen(_app: App, onBack: () => void): Screen {
  return { update() {}, render() {}, onClick: onBack };
}
