import type { CodexOptions } from '@openai/codex-sdk';

const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const CORE_COMMAND_ENVIRONMENT = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'LC_*',
  'TERM',
  'COLORTERM',
  'TMPDIR',
  'TMP',
  'TEMP',
  'CODEX_HOME',
  'PRODEX_*',
  'PYTHONUSERBASE',
  'PIP_*',
  'NPM_CONFIG_PREFIX',
  'npm_config_prefix',
  'NODE_PATH',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'GOPATH',
  'GOBIN',
  'GEM_HOME',
  'PIPX_*',
  'UV_*',
  'LIBRARY_PATH',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'CPATH',
  'PKG_CONFIG_PATH',
  'CMAKE_PREFIX_PATH',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'CURL_CA_BUNDLE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
];

const PERSISTENT_ENVIRONMENT_KEYS = [
  'PATH',
  'CODEX_HOME',
  'PRODEX_DEPENDENCIES_HOME',
  'PYTHONUSERBASE',
  'NPM_CONFIG_PREFIX',
  'NODE_PATH',
  'CARGO_HOME',
  'GOPATH',
  'GOBIN',
  'GEM_HOME',
  'PIPX_HOME',
  'PIPX_BIN_DIR',
  'UV_TOOL_DIR',
  'UV_TOOL_BIN_DIR',
  'UV_PYTHON_INSTALL_DIR',
  'UV_PYTHON_BIN_DIR',
  'LIBRARY_PATH',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'CPATH',
  'PKG_CONFIG_PATH',
  'CMAKE_PREFIX_PATH',
];

type CodexConfig = NonNullable<CodexOptions['config']>;

export function parseEnvironmentVariableNames(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const entries = (Array.isArray(value) ? value.map(String) : String(value).split(/[\s,]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);

  const invalid = entries.find((entry) => !ENVIRONMENT_NAME_PATTERN.test(entry));
  if (invalid) {
    throw new Error(
      `Invalid environment variable name "${invalid}". Enter names only, separated by commas or new lines.`,
    );
  }

  return [...new Set(entries)];
}

export function findMissingEnvironmentVariables(
  env: Record<string, string>,
  names: string[] | undefined,
): string[] {
  return [...new Set(names ?? [])].filter((name) => env[name] === undefined || env[name] === '');
}

export function buildCodexProcessConfig(params: {
  env: Record<string, string>;
  personalityConfig?: Record<string, string>;
  allowedEnvironmentVariables?: string[];
  suppliedEnvironmentVariables?: string[];
}): CodexConfig {
  const allowedNames = [
    ...(params.allowedEnvironmentVariables ?? []),
    ...(params.suppliedEnvironmentVariables ?? []),
  ];
  const forwardedNames = [...new Set(allowedNames)].filter((name) =>
    ENVIRONMENT_NAME_PATTERN.test(name),
  );
  const persistentEnvironment = Object.fromEntries(
    PERSISTENT_ENVIRONMENT_KEYS.flatMap((key) =>
      params.env[key] === undefined ? [] : [[key, params.env[key]]],
    ),
  );

  const shellEnvironmentPolicy: CodexConfig = {
    inherit: 'all',
    set: persistentEnvironment,
  };

  if (forwardedNames.length > 0) {
    // Codex filters KEY/SECRET/TOKEN variables by default. Opt out only while
    // simultaneously applying a strict allowlist of core variables and names
    // explicitly provided by the ProDex node.
    shellEnvironmentPolicy.ignore_default_excludes = true;
    shellEnvironmentPolicy.include_only = [
      ...new Set([...CORE_COMMAND_ENVIRONMENT, ...forwardedNames]),
    ];
  }

  return {
    ...params.personalityConfig,
    // Codex shell tools otherwise use `/bin/sh -lc`; login profiles in minimal
    // n8n containers commonly replace PATH and hide ProDex-managed executables.
    allow_login_shell: false,
    shell_environment_policy: shellEnvironmentPolicy,
  };
}
