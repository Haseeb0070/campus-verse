/** The web build has no phone push (see push.ts): these stand in so the same code runs. */
export async function registerForPush(): Promise<void> {}

export async function unregisterForPush(): Promise<void> {}

export function usePush(_signedIn: boolean) {}
