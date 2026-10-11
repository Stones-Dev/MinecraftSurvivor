/** English-only string table, keyed so other languages can be added later. */
const en = {
  'game.title': 'MineSurvive',
  'game.tagline': 'Survive the night. Gear up. Collect every mob.',
  'title.start': 'Click to start',
  'screen.hub': 'Main menu',
  'screen.empty': 'Coming soon',
} as const;

export type StringKey = keyof typeof en;

export function t(key: StringKey): string {
  return en[key];
}
