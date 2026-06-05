const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function resolveHostApiBase(value) {
  return value
    .replace("://10.0.2.2", "://127.0.0.1")
    .replace(/^10\.0\.2\.2(?=:|$)/, "127.0.0.1")
    .replace(/\/+$/, "");
}

function resolveHostPort(value, fallback) {
  return (value || fallback)
    .replace(/^https?:\/\//, "")
    .replace(/^10\.0\.2\.2(?=:|$)/, "127.0.0.1")
    .replace(/^localhost(?=:|$)/, "127.0.0.1")
    .replace(/\/+$/, "");
}

function firestoreString(value) {
  return { stringValue: value };
}

function firestoreInteger(value) {
  return { integerValue: String(value) };
}

function firestoreMessage(message) {
  return {
    mapValue: {
      fields: {
        content: firestoreString(message.content),
        role: firestoreString(message.role),
        timestamp_ms: firestoreInteger(message.timestamp_ms),
        ...(message.model ? { model: firestoreString(message.model) } : {}),
      },
    },
  };
}

async function request(apiBase, pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    signal: controller.signal,
    headers: {
      "x-test-key": process.env.E2E_TEST_KEY || process.env.GABRIEL_TEST_KEY || "gabriel-local-test-key",
      ...(options.headers || {}),
    },
  }).finally(() => {
    clearTimeout(timeout);
  });
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(`${pathname} failed with ${response.status}: ${text}`);
  }

  if (typeof payload === "string") {
    throw new Error(
      `${pathname} returned non-JSON ${response.status}: ${payload.slice(0, 160)}`
    );
  }

  return payload;
}

async function signInAuthEmulator({ authHost, email, password }) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok || !payload || typeof payload === "string" || !payload.idToken) {
    throw new Error(`Auth emulator sign-in failed with ${response.status}: ${text}`);
  }

  return payload.idToken;
}

const DEFAULT_ASSISTANT_TEXT = [
  "This is the QR-MOB-021 voice playback diagnostic message. It is intentionally long enough to exercise streaming playback rather than only a tiny audio response.",
  "Listen for whether the final sentences arrive naturally, whether playback stops early, and whether the player reports a finish event that matches the reported duration.",
  "The content itself is calm and repetitive by design so the operator can focus on the audio behavior instead of the words.",
  "Continue through this paragraph and notice whether there is any sudden cutoff, buffering pause, or mismatch between the visible telemetry and what is heard.",
  "The final line should be audible: this diagnostic playback reached the end of the saved assistant message.",
].join(" ");

const MEDIUM_PRODUCTION_SHAPED_ASSISTANT_TEXT = [
  "I want to answer this slowly and concretely, because the situation you are describing has several layers and it would be easy to flatten it into advice that sounds correct but is not actually usable.",
  "First, there is the practical layer. You are trying to make sense of a pattern that keeps repeating, and the most useful next step is to separate the parts that are directly observable from the parts that are inferred. Observable details are things like what was said, when it happened, what changed afterward, and what you were asked to do. Inferred details are things like motive, hidden meaning, or whether someone would have acted differently if they cared more.",
  "Second, there is the emotional layer. If you have been carrying this for a while, your nervous system may be responding to the pattern before your thoughts have time to catch up. That does not mean the reaction is wrong. It means the reaction is giving you information.",
  "A good test is to imagine explaining the boundary to someone kind who knows nothing about the history. If it sounds punitive or vague, it probably needs to be simplified. If it sounds clear, measurable, and connected to your wellbeing, it is probably close.",
  "Final diagnostic sentence: the playback should continue through this closing line without cutting off the final words.",
].join(" ");

const LONG_PRODUCTION_SHAPED_ASSISTANT_TEXT = [
  "I want to answer this slowly and concretely, because the situation you are describing has several layers and it would be easy to flatten it into advice that sounds correct but is not actually usable.",
  "First, there is the practical layer. You are trying to make sense of a pattern that keeps repeating, and the most useful next step is to separate the parts that are directly observable from the parts that are inferred. Observable details are things like what was said, when it happened, what changed afterward, and what you were asked to do. Inferred details are things like motive, hidden meaning, or whether someone would have acted differently if they cared more. Both layers matter, but mixing them too quickly can make the whole experience feel louder and less navigable.",
  "Second, there is the emotional layer. If you have been carrying this for a while, your nervous system may be responding to the pattern before your thoughts have time to catch up. That does not mean the reaction is wrong. It means the reaction is giving you information. The task is not to argue yourself out of it. The task is to ask what it is protecting you from, what it needs in order to settle, and whether the current situation can realistically provide that.",
  "Third, there is the boundary layer. A useful boundary is specific enough that you can tell whether it is being respected. It might sound like: I can talk about this tonight for twenty minutes, but I cannot keep reopening the same conversation after midnight. Or: I am willing to hear feedback, but I need it to be about one concrete behavior rather than a global judgment about who I am. The point is not to control another person. The point is to make your participation conditional on the conversation staying workable.",
  "A good test is to imagine explaining the boundary to someone kind who knows nothing about the history. If it sounds punitive or vague, it probably needs to be simplified. If it sounds clear, measurable, and connected to your wellbeing, it is probably close.",
  "There is also a timing question. Not every important conversation becomes more honest by happening immediately. Sometimes the strongest move is to pause, write down the actual request, and return when your body is not treating the conversation like an emergency. A pause can be avoidance, but it can also be stewardship. The difference is whether you use the pause to disappear or to come back with better language.",
  "If you choose to respond, try beginning with the smallest true sentence. Something like: I want to understand this, but I am getting overwhelmed and I need to slow it down. Or: I can hear that this matters to you, and I also need us to stay with one example at a time. The smallest true sentence is often more effective than the perfect comprehensive explanation, because it gives both people something real to orient around.",
  "The part I would pay attention to is what happens after you become clear. If the other person can adjust, even imperfectly, there may be room for repair. If clarity consistently makes things escalate, that is important data. It does not require you to decide the whole future in one moment, but it does ask you to stop treating confusion as the only available explanation.",
  "For tonight, the grounded version might be: name what happened, name what you need next, and make one request that can actually be answered. Then give yourself permission to stop after that. You do not have to solve the entire pattern before you are allowed to rest.",
  "Final diagnostic sentence: the playback should continue through this closing line without cutting off the final words.",
].join(" ");

function readTextFile(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  return fs.readFileSync(resolvedPath, "utf8").trim();
}

function repeatAssistantText(text, repeatCount) {
  if (!Number.isFinite(repeatCount) || repeatCount <= 1) {
    return text;
  }

  return Array.from({ length: repeatCount }, (_, index) => {
    if (index === 0) {
      return text;
    }

    return `Repeat pass ${index + 1}. ${text}`;
  }).join("\n\n");
}

function resolveAssistantText() {
  const variant = (process.env.VOICE_DIAGNOSTIC_ASSISTANT_TEXT_VARIANT || "default").toLowerCase();
  const repeatCount = Number.parseInt(process.env.VOICE_DIAGNOSTIC_TEXT_REPEAT || "1", 10);
  const filePath = process.env.VOICE_DIAGNOSTIC_ASSISTANT_TEXT_FILE;
  const explicitText =
    process.env.VOICE_DIAGNOSTIC_ASSISTANT_TEXT ||
    process.env.EXPO_PUBLIC_VOICE_DIAGNOSTIC_ASSISTANT_TEXT;
  let baseText = DEFAULT_ASSISTANT_TEXT;

  if (explicitText) {
    baseText = explicitText;
  } else if (filePath) {
    baseText = readTextFile(filePath);
  } else if (variant === "medium") {
    baseText = MEDIUM_PRODUCTION_SHAPED_ASSISTANT_TEXT;
  } else if (variant === "long" || variant === "production") {
    baseText = LONG_PRODUCTION_SHAPED_ASSISTANT_TEXT;
  } else if (variant === "very-long") {
    baseText = repeatAssistantText(LONG_PRODUCTION_SHAPED_ASSISTANT_TEXT, 2);
  }

  return {
    assistantText: repeatAssistantText(baseText, repeatCount),
    repeatCount,
    variant,
  };
}

async function patchSeedConversationForVoice({
  assistantText,
  firestoreHost,
  projectId,
  uid,
}) {
  const baseTs = Date.now();
  const url =
    `http://${firestoreHost}/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}` +
    "/conversations/seed-conv-001?updateMask.fieldPaths=messages";
  const response = await fetch(url, {
    body: JSON.stringify({
      fields: {
        messages: {
          arrayValue: {
            values: [
              firestoreMessage({
                content: "Seeded QR-MOB-021 voice diagnostic prompt",
                role: "user",
                timestamp_ms: baseTs,
              }),
              firestoreMessage({
                content: assistantText,
                model: "gpt-5.1-chat-latest",
                role: "assistant",
                timestamp_ms: baseTs + 500,
              }),
            ],
          },
        },
      },
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Firestore seed conversation patch failed with ${response.status}: ${text}`
    );
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const baseEnv = parseEnvFile(path.join(root, ".env"));
  const localQaEnv = parseEnvFile(path.join(root, ".env.local.qa"));
  const apiBase = resolveHostApiBase(
    process.env.E2E_API_BASE ||
      process.env.EXPO_PUBLIC_API_BASE ||
      localQaEnv.EXPO_PUBLIC_API_BASE ||
      baseEnv.EXPO_PUBLIC_API_BASE ||
      "http://127.0.0.1:5000"
  );
  const projectId =
    process.env.EXPO_PUBLIC_FB_PROJECT_ID ||
    localQaEnv.EXPO_PUBLIC_FB_PROJECT_ID ||
    baseEnv.EXPO_PUBLIC_FB_PROJECT_ID ||
    "gabriel-qa-89f20";
  const firestoreHost = resolveHostPort(
    process.env.FIRESTORE_EMULATOR_HOST || localQaEnv.FIRESTORE_EMULATOR_HOST,
    "127.0.0.1:8080"
  );
  const authHost = resolveHostPort(
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      localQaEnv.EXPO_PUBLIC_FB_AUTH_EMULATOR_HOST ||
      baseEnv.EXPO_PUBLIC_FB_AUTH_EMULATOR_HOST,
    "127.0.0.1:9099"
  );
  const { assistantText, repeatCount, variant } = resolveAssistantText();
  const uid = process.env.VOICE_DIAGNOSTIC_UID || `voice-diag-${Date.now()}`;
  const count = Number.parseInt(process.env.VOICE_DIAGNOSTIC_SEED_COUNT || "1", 10);

  const user = await request(apiBase, "/test/create-user", {
    body: JSON.stringify({ uid }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const seeded = await request(apiBase, "/test/seed-conversations", {
    body: JSON.stringify({ count, uid: user.uid }),
    headers: {
      Authorization: `Bearer ${user.idToken || user.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  await patchSeedConversationForVoice({
    assistantText,
    firestoreHost,
    projectId,
    uid: user.uid,
  });

  const conversationId = "seed-conv-001";
  const messageIndex = 1;
  const diagnosticAuthToken = await signInAuthEmulator({
    authHost,
    email: user.email,
    password: user.password,
  });

  console.log(
    JSON.stringify(
      {
        apiBase,
        authHost,
        conversationId,
        email: user.email,
        firestoreHost,
        messageIndex,
        password: user.password,
        seedTextRepeat: repeatCount,
        seedTextVariant: variant,
        savedAssistantTextLength: assistantText.length,
        seeded,
        tokenPreview: `${diagnosticAuthToken.slice(0, 18)}...`,
        uid: user.uid,
      },
      null,
      2
    )
  );
  console.log("");
  console.log("Use these for the diagnostic harness:");
  console.log(`EXPO_PUBLIC_VOICE_DIAGNOSTIC_CONVERSATION_ID=${conversationId}`);
  console.log(`EXPO_PUBLIC_VOICE_DIAGNOSTIC_EMAIL=${user.email}`);
  console.log(`EXPO_PUBLIC_VOICE_DIAGNOSTIC_MESSAGE_INDEX=${messageIndex}`);
  console.log(`EXPO_PUBLIC_VOICE_DIAGNOSTIC_PASSWORD=${user.password}`);
  console.log(`EXPO_PUBLIC_VOICE_DIAGNOSTIC_AUTH_TOKEN=${diagnosticAuthToken}`);
  console.log("");
  console.log("Sign into the app with:");
  console.log(`email=${user.email}`);
  console.log(`password=${user.password}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
