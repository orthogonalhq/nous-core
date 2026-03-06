declare module 'semver' {
  export function valid(version: string): string | null;
  export function validRange(range: string): string | null;
  export function satisfies(
    version: string,
    range: string,
    options?: { includePrerelease?: boolean },
  ): boolean;
}
