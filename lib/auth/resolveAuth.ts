import type { CodexCredentialValues, CodexTokenBundle, FetchLike } from '../types/codex';
import { CodexAuthSetupError } from '../errors';
import {
  authJsonToTokenBundle,
  hasCompleteCodexAuth,
  hasRunnableAuthTokens,
  readAuthJson,
  resolveCodexHome,
  updateAuthJsonTokens,
} from './codexEnv';
import { ensureValidTokenBundle } from './deviceCodeAuth';
import { normalizeTokenBundle } from './tokenStore';

export async function resolveRunnableAuth(
  fetchImpl: FetchLike,
  credentials?: CodexCredentialValues | null,
): Promise<{ activeBundle: CodexTokenBundle; codexHome: string }> {
  const codexHome = resolveCodexHome();
  const diskAuth = readAuthJson(codexHome);

  let bundle: CodexTokenBundle;
  if (diskAuth && hasRunnableAuthTokens(diskAuth)) {
    bundle = authJsonToTokenBundle(diskAuth);
  } else if (credentials) {
    bundle = normalizeTokenBundle(credentials);
  } else {
    throw new CodexAuthSetupError(
      'No Codex auth found. Run ProDex Setup → Start Device Login, complete browser auth, wait ~30 seconds, then run ProDex again.',
    );
  }

  const auth = await ensureValidTokenBundle(fetchImpl, bundle);
  const activeBundle = auth.updatedBundle ?? bundle;
  updateAuthJsonTokens(activeBundle, codexHome);

  const refreshedAuth = readAuthJson(codexHome);
  if (!hasCompleteCodexAuth(refreshedAuth)) {
    throw new CodexAuthSetupError(
      'Codex auth is incomplete. Run ProDex Setup → Start Device Login, complete browser auth, then Wait for Login Complete.',
    );
  }

  return { activeBundle, codexHome };
}
