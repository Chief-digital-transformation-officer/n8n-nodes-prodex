import { mkdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export interface DependencyEnvironment {
  home: string;
  binDirectory: string;
  pythonUserBase: string;
  npmPrefix: string;
  cargoHome: string;
  goPath: string;
  gemHome: string;
  pipxHome: string;
  uvToolHome: string;
  pathDirectories: string[];
  libraryDirectories: string[];
  includeDirectory: string;
  pkgConfigDirectories: string[];
}

export function resolveDependencyEnvironment(codexHome: string): DependencyEnvironment {
  const home = join(codexHome, 'dependencies');
  const pythonUserBase = join(home, 'python');
  const npmPrefix = join(home, 'npm');
  const cargoHome = join(home, 'cargo');
  const goPath = join(home, 'go');
  const gemHome = join(home, 'ruby');
  const pipxHome = join(home, 'pipx');
  const uvToolHome = join(home, 'uv');
  const binDirectory = join(home, 'bin');
  const libraryDirectories = [join(home, 'lib'), join(home, 'lib64')];
  const includeDirectory = join(home, 'include');
  const pkgConfigDirectories = [
    join(home, 'lib', 'pkgconfig'),
    join(home, 'lib64', 'pkgconfig'),
    join(home, 'share', 'pkgconfig'),
  ];

  return {
    home,
    binDirectory,
    pythonUserBase,
    npmPrefix,
    cargoHome,
    goPath,
    gemHome,
    pipxHome,
    uvToolHome,
    libraryDirectories,
    includeDirectory,
    pkgConfigDirectories,
    pathDirectories: [
      binDirectory,
      join(pythonUserBase, 'bin'),
      join(npmPrefix, 'bin'),
      join(cargoHome, 'bin'),
      join(goPath, 'bin'),
      join(gemHome, 'bin'),
      join(pipxHome, 'bin'),
      join(uvToolHome, 'bin'),
    ],
  };
}

export function applyDependencyEnvironment(
  env: Record<string, string>,
  codexHome: string,
): DependencyEnvironment {
  const dependencyEnvironment = resolveDependencyEnvironment(codexHome);
  mkdirSync(dependencyEnvironment.home, { recursive: true, mode: 0o700 });
  for (const directory of dependencyEnvironment.pathDirectories) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  for (const directory of [
    ...dependencyEnvironment.libraryDirectories,
    dependencyEnvironment.includeDirectory,
    ...dependencyEnvironment.pkgConfigDirectories,
  ]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  const pathKey =
    process.platform === 'win32'
      ? (Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path')
      : 'PATH';
  const managedPaths = new Set(dependencyEnvironment.pathDirectories);
  const existingPaths = (env[pathKey] ?? '')
    .split(delimiter)
    .filter((entry) => entry && !managedPaths.has(entry));

  env[pathKey] = [...dependencyEnvironment.pathDirectories, ...existingPaths].join(delimiter);
  env.PRODEX_DEPENDENCIES_HOME = dependencyEnvironment.home;
  env.PYTHONUSERBASE = dependencyEnvironment.pythonUserBase;
  env.NPM_CONFIG_PREFIX = dependencyEnvironment.npmPrefix;
  env.CARGO_HOME = dependencyEnvironment.cargoHome;
  env.GOPATH = dependencyEnvironment.goPath;
  env.GOBIN = dependencyEnvironment.binDirectory;
  env.GEM_HOME = dependencyEnvironment.gemHome;
  env.PIPX_HOME = dependencyEnvironment.pipxHome;
  env.PIPX_BIN_DIR = join(dependencyEnvironment.pipxHome, 'bin');
  env.UV_TOOL_DIR = join(dependencyEnvironment.uvToolHome, 'tools');
  env.UV_TOOL_BIN_DIR = join(dependencyEnvironment.uvToolHome, 'bin');
  env.UV_PYTHON_INSTALL_DIR = join(dependencyEnvironment.uvToolHome, 'python');
  env.UV_PYTHON_BIN_DIR = dependencyEnvironment.binDirectory;

  const globalNodeModules = join(dependencyEnvironment.npmPrefix, 'lib', 'node_modules');
  env.NODE_PATH = [globalNodeModules, env.NODE_PATH].filter(Boolean).join(delimiter);
  env.LIBRARY_PATH = [...dependencyEnvironment.libraryDirectories, env.LIBRARY_PATH]
    .filter(Boolean)
    .join(delimiter);
  env.LD_LIBRARY_PATH = [...dependencyEnvironment.libraryDirectories, env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(delimiter);
  env.DYLD_LIBRARY_PATH = [...dependencyEnvironment.libraryDirectories, env.DYLD_LIBRARY_PATH]
    .filter(Boolean)
    .join(delimiter);
  env.CPATH = [dependencyEnvironment.includeDirectory, env.CPATH].filter(Boolean).join(delimiter);
  env.PKG_CONFIG_PATH = [...dependencyEnvironment.pkgConfigDirectories, env.PKG_CONFIG_PATH]
    .filter(Boolean)
    .join(delimiter);
  env.CMAKE_PREFIX_PATH = [dependencyEnvironment.home, env.CMAKE_PREFIX_PATH]
    .filter(Boolean)
    .join(delimiter);

  return dependencyEnvironment;
}
