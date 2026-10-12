import type { App } from '../app';
import type { Screen } from './router';

/** Stub: replaced by the real collection screen. */
export function collectionScreen(_app: App, onBack: () => void): Screen {
  return { update() {}, render() {}, onClick: onBack };
}
