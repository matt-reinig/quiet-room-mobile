import { LogBox, NativeModules, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useState } from "react";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import FeatureFlagsGate from "./src/components/FeatureFlagsGate";
import { FeatureFlagsProvider } from "./src/contexts/FeatureFlagsContext";
import { RENDER_MODE, isVoicePlaybackDiagnosticsAllowedForUser } from "./src/config/env";
import QuietRoomScreen from "./src/screens/QuietRoomScreen";
import QuietRoomWebParityScreen from "./src/screens/QuietRoomWebParityScreen";
import VoicePlaybackDiagnosticsScreen from "./src/screens/VoicePlaybackDiagnosticsScreen";

type VoiceDiagnosticsTarget = {
  conversationId?: string | null;
  messageIndex?: number | null;
};

const detoxSettings = NativeModules.SettingsManager?.settings ?? {};
const isDetoxSession = Boolean(
  detoxSettings.detoxServer ||
    detoxSettings.detoxSessionId ||
    detoxSettings.detoxEnableSynchronization !== undefined
);

if (isDetoxSession) {
  LogBox.ignoreAllLogs();
}

export default function App() {
  if (RENDER_MODE === "voice-diagnostics") {
    return (
      <SafeAreaProvider>
        <AuthProvider>
          <VoicePlaybackDiagnosticsScreen />
        </AuthProvider>
      </SafeAreaProvider>
    );
  }

  if (RENDER_MODE === "webview") {
    return <QuietRoomWebParityScreen />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NativeApp />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function NativeApp() {
  const { user } = useAuth();
  const [showVoiceDiagnostics, setShowVoiceDiagnostics] = useState(false);
  const [voiceDiagnosticsTarget, setVoiceDiagnosticsTarget] =
    useState<VoiceDiagnosticsTarget | null>(null);
  const diagnosticsAllowed = isVoicePlaybackDiagnosticsAllowedForUser(user?.uid);

  return (
    <>
      <View style={showVoiceDiagnostics ? styles.hiddenSurface : styles.activeSurface}>
        <FeatureFlagsProvider>
          <FeatureFlagsGate>
            <QuietRoomScreen
              onOpenVoiceDiagnostics={
                diagnosticsAllowed
                  ? (target) => {
                      setVoiceDiagnosticsTarget(target);
                      setShowVoiceDiagnostics(true);
                    }
                  : undefined
              }
            />
          </FeatureFlagsGate>
        </FeatureFlagsProvider>
      </View>
      {showVoiceDiagnostics ? (
        <View style={styles.activeSurface}>
          <VoicePlaybackDiagnosticsScreen
            initialConversationId={voiceDiagnosticsTarget?.conversationId}
            initialMessageIndex={voiceDiagnosticsTarget?.messageIndex}
            onClose={() => setShowVoiceDiagnostics(false)}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  activeSurface: {
    flex: 1,
  },
  hiddenSurface: {
    display: "none",
  },
});
