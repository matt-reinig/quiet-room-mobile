import type { User } from "firebase/auth";
import { API_BASE } from "../config/env";

type ClientEventPayload = Record<string, unknown>;

type SendClientEventArgs = {
  event: string;
  payload?: ClientEventPayload;
  user: User | null;
};

export async function sendClientEvent({
  event,
  payload = {},
  user,
}: SendClientEventArgs): Promise<void> {
  if (!user) {
    return;
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${API_BASE}/api/client-events`, {
    body: JSON.stringify({ event, payload }),
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Client event failed: ${response.status}`);
  }
}
