// Signing out of this browser, from the header menu or the profile page. Loaded on demand.

import { disconnect, loadGoogle, sync } from './cloud.ts';
import { cloudState, PROVIDERS, unsaved } from './local.ts';
import { clearBrowser } from './store.ts';

/** Loads Google's sign-in ahead of the click, so its window may open straight from it. */
export function warmUp(): void {
  if (cloudState()?.provider === 'google') loadGoogle().catch(() => {});
}

/**
 * Brings the cloud save up to date (if one is connected), disconnects it and removes the save,
 * name and picture from this browser. Throws, removing nothing, when the cloud could not be saved.
 */
export async function signOut(): Promise<void> {
  const cloud = cloudState();
  if (cloud) {
    if (unsaved(cloud)) {
      try {
        await sync({ interactive: true });
      } catch (error) {
        const reason = error instanceof Error ? ` ${error.message}` : '';
        throw new Error(
          `Could not save to ${PROVIDERS[cloud.provider]} first, so nothing was removed.${reason}`,
          { cause: error },
        );
      }
    }
    await disconnect();
  }
  await clearBrowser();
}
