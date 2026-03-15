import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { WEB_APP_URL } from "../config/env";
import Spinner from "../components/Spinner";

export default function QuietRoomWebParityScreen() {
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <WebView
        key={reloadKey}
        onError={(event) => {
          const description = event.nativeEvent?.description;
          setError(typeof description === "string" ? description : "Failed to load web app.");
        }}
        onLoadStart={() => {
          setError(null);
        }}
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <Spinner label="Opening Quiet Room..." size="lg" tone="accent" />
          </View>
        )}
        source={{ uri: WEB_APP_URL }}
        startInLoadingState
      />

      {error ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Unable to load Quiet Room</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <Pressable
            onPress={() => {
              setReloadKey((value) => value + 1);
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorMessage: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
  },
  errorOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#E5E7EB",
    borderTopWidth: 1,
    bottom: 0,
    gap: 10,
    left: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: "absolute",
    right: 0,
  },
  errorTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  loadingWrap: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  retryButton: {
    backgroundColor: "#1D4ED8",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  safeArea: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
});

