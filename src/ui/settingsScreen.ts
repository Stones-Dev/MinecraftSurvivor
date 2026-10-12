import type { App } from '../app';
import type { Screen } from './router';

/** Stub: replaced by the real settings screen. */
export function settingsScreen(_app: App, onBack: () => void): Screen {
  return { update() {}, render() {}, onClick: onBack };
}
