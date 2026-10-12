import type { App } from '../app';
import type { RunLoadout } from '../systems/meta';
import type { Screen } from './router';

/** Stub: replaced by the real run setup screen. */
export function runSetupScreen(
  _app: App,
  _onStart: (loadout: RunLoadout) => void,
  onBack: () => void,
): Screen {
  return { update() {}, render() {}, onClick: onBack };
}
