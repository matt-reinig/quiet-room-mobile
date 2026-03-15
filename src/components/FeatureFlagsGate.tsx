import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureFlags } from "../contexts/FeatureFlagsContext";
import Spinner from "./Spinner";

type FeatureFlagsGateProps = {
  children: ReactNode;
};

export default function FeatureFlagsGate({ children }: FeatureFlagsGateProps) {
  const { user } = useAuth();
  const { loading } = useFeatureFlags();

  if (!user) {
    return children;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Spinner label="Loading settings..." size="lg" tone="accent" />
      </View>
    );
  }

  // Non-blocking fallback: when feature flags fail to load, use defaults.
  return children;
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 24,
  },
});

