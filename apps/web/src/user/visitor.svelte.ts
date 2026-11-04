// The visitor as Svelte components see it: name and picture, cloud connection and the state of
// the last cloud save, kept current when anything changes here or in another tab.

import {
  CLOUD_EVENT,
  cloudDot,
  cloudState,
  onLocalChange,
  profileMirror,
  type CloudState,
  type ProfileMirror,
} from './local.ts';

export type SyncState = 'idle' | 'saving' | 'saved' | 'auth' | 'error';

class Visitor {
  profile = $state<ProfileMirror | null>(null);
  cloud = $state<CloudState | null>(null);
  dot = $state<ReturnType<typeof cloudDot>>(null);
  /** What the cloud code is doing in this tab right now. */
  sync = $state<SyncState>('idle');
  message = $state('');
  /** Bumped every half minute, so "2 min ago" texts stay true. */
  now = $state(Date.now());
  #started = false;

  read = (): void => {
    this.profile = profileMirror();
    this.cloud = cloudState();
    this.dot = cloudDot(this.cloud);
    this.now = Date.now();
  };

  /** Starts listening (once per page). */
  start(): void {
    this.read();
    if (this.#started) return;
    this.#started = true;
    onLocalChange(this.read);
    addEventListener(CLOUD_EVENT, (event) => {
      const detail = (event as CustomEvent<{ state: SyncState; message?: string } | undefined>)
        .detail;
      if (detail) {
        this.sync = detail.state;
        this.message = detail.message ?? '';
      }
    });
    setInterval(() => (this.now = Date.now()), 30_000);
  }
}

export const visitor = new Visitor();
