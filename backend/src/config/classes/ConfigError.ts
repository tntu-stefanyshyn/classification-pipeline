/** Thrown at startup with every problem found, one per line. */
export class ConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(
      `Invalid backend configuration (${errors.length} ${errors.length === 1 ? 'problem' : 'problems'}):\n` +
        errors.map((error) => `  - ${error}`).join('\n') +
        '\nFix the values in backend/.env or the environment; see docs/operations/configuration.md.'
    );
    this.name = 'ConfigError';
  }
}
