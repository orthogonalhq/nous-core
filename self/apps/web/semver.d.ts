declare module 'semver' {
  interface SatisfiesOptions {
    includePrerelease?: boolean;
  }

  interface SemverModule {
    valid(version: string): string | null;
    validRange(range: string): string | null;
    satisfies(
      version: string,
      range: string,
      options?: SatisfiesOptions,
    ): boolean;
  }

  const semver: SemverModule;
  export default semver;
}
