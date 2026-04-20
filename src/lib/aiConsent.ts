import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "firebase/auth";
import { API_BASE } from "../config/env";

const ANONYMOUS_AI_CONSENT_KEY = "gabriel.aiConsent.anonymous.accepted";
const AI_CONSENT_SOURCE = "quiet-room-mobile";

function resolveAiConsentStorageKey(user: User | null): string {
  if (!user || user.isAnonymous) {
    return ANONYMOUS_AI_CONSENT_KEY;
  }

  return `gabriel.aiConsent.user.${user.uid}.accepted`;
}

async function getLocalAiConsentAccepted(user: User | null): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(resolveAiConsentStorageKey(user))) === "1";
  } catch {
    return false;
  }
}

async function setLocalAiConsentAccepted(user: User | null, accepted: boolean): Promise<void> {
  const storageKey = resolveAiConsentStorageKey(user);

  if (accepted) {
    await AsyncStorage.setItem(storageKey, "1");
    return;
  }

  await AsyncStorage.removeItem(storageKey);
}

async function getUserToken(user: User, forceRefresh = false): Promise<string> {
  return user.getIdToken(forceRefresh);
}

async function fetchAiConsentResponse(user: User, forceRefresh = false): Promise<Response> {
  const idToken = await getUserToken(user, forceRefresh);
  return fetch(`${API_BASE}/api/account/ai-consent`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function getAiConsentAccepted(user: User | null): Promise<boolean> {
  if (!user || user.isAnonymous) {
    return getLocalAiConsentAccepted(user);
  }

  const localAccepted = await getLocalAiConsentAccepted(user);

  try {
    let response = await fetchAiConsentResponse(user);

    if (response.status === 401) {
      response = await fetchAiConsentResponse(user, true);
    }

    if (!response.ok) {
      throw new Error(`Failed to load AI consent: ${response.status}`);
    }

    const payload = (await response.json()) as Partial<{ aiSharingAccepted: unknown }>;
    const accepted = payload.aiSharingAccepted === true;
    await setLocalAiConsentAccepted(user, accepted);
    return accepted;
  } catch {
    return localAccepted;
  }
}

export async function setAiConsentAccepted(user: User | null, accepted: boolean): Promise<void> {
  if (!user || user.isAnonymous) {
    await setLocalAiConsentAccepted(user, accepted);
    return;
  }

  let response = await fetch(`${API_BASE}/api/account/ai-consent`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${await getUserToken(user)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      aiSharingAccepted: accepted,
      source: AI_CONSENT_SOURCE,
    }),
  });

  if (response.status === 401) {
    response = await fetch(`${API_BASE}/api/account/ai-consent`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${await getUserToken(user, true)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aiSharingAccepted: accepted,
        source: AI_CONSENT_SOURCE,
      }),
    });
  }

  if (!response.ok) {
    throw new Error(`Failed to save AI consent: ${response.status}`);
  }

  await setLocalAiConsentAccepted(user, accepted);
}
