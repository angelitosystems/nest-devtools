/** Parsed CLI invocation. */
export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
  help: boolean;
  version: boolean;
}

/** Commands supported by the CLI. */
export const COMMANDS = ['start', 'status', 'projects', 'logs', 'doctor', 'init', 'help'] as const;

/** Parse process.argv-style input into a structured invocation. */
export function parseArgs(argv: string[]): ParsedArgs {
  let command = '';
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags['help'] = true;
    else if (arg === '--version' || arg === '-v') flags['version'] = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (command === '') {
      command = arg;
    }
  }

  return {
    command: command || 'start',
    flags,
    help: flags['help'] === true,
    version: flags['version'] === true,
  };
}
