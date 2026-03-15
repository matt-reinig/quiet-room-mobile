import { AuthProvider } from "./src/contexts/AuthContext";
import FeatureFlagsGate from "./src/components/FeatureFlagsGate";
import { FeatureFlagsProvider } from "./src/contexts/FeatureFlagsContext";
import { RENDER_MODE } from "./src/config/env";
import QuietRoomScreen from "./src/screens/QuietRoomScreen";
import QuietRoomWebParityScreen from "./src/screens/QuietRoomWebParityScreen";

export default function App() {
  if (RENDER_MODE === "webview") {
    return <QuietRoomWebParityScreen />;
  }

  return (
    <AuthProvider>
      <FeatureFlagsProvider>
        <FeatureFlagsGate>
          <QuietRoomScreen />
        </FeatureFlagsGate>
      </FeatureFlagsProvider>
    </AuthProvider>
  );
}
