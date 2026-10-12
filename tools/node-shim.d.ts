// Minimal Node typings for tools/ (the project deliberately has no @types/node dependency).
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
}
declare const process: { env: Record<string, string | undefined> };
