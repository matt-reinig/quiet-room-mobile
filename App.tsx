import { LogBox, NativeModules } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/contexts/AuthContext";
import FeatureFlagsGate from "./src/components/FeatureFlagsGate";
import { FeatureFlagsProvider } from "./src/contexts/FeatureFlagsContext";
import { RENDER_MODE } from "./src/config/env";
import QuietRoomScreen from "./src/screens/QuietRoomScreen";
import QuietRoomWebParityScreen from "./src/screens/QuietRoomWebParityScreen";

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
  if (RENDER_MODE === "webview") {
    return <QuietRoomWebParityScreen />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <FeatureFlagsProvider>
          <FeatureFlagsGate>
            <QuietRoomScreen />
          </FeatureFlagsGate>
        </FeatureFlagsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
