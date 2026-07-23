export class CodexAuthSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexAuthSetupError';
  }
}

export class CodexAuthRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexAuthRefreshError';
  }
}

export class CodexRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CodexRequestError';
    this.status = status;
  }
}

export class CodexAgentTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    super(
      `Codex was still working when the ${timeoutSeconds}-second ProDex timeout expired. Increase Options → Timeout (Seconds) for long agentic tasks, or reduce the requested scope.`,
    );
    this.name = 'CodexAgentTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class SkillCliInstallError extends Error {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;

  constructor(
    message: string,
    details: { command: string; stdout: string; stderr: string; exitCode: number },
  ) {
    super(message);
    this.name = 'SkillCliInstallError';
    this.command = details.command;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
    this.exitCode = details.exitCode;
  }
}

export class CodexRuntimeInstallError extends Error {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;

  constructor(
    message: string,
    details: { command: string; stdout: string; stderr: string; exitCode: number },
  ) {
    super(message);
    this.name = 'CodexRuntimeInstallError';
    this.command = details.command;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
    this.exitCode = details.exitCode;
  }
}
