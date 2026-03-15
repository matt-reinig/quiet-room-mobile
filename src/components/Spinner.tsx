import { Animated, Easing, StyleSheet, Text, View, type TextStyle } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import { mobileWeb } from "../theme/mobileWeb";

type SpinnerTone = "accent" | "default" | "light" | "muted";

type SpinnerProps = {
  label?: string;
  size?: "lg" | "sm";
  tone?: SpinnerTone;
};

function resolveTone(tone: SpinnerTone): { color: string; labelStyle: TextStyle; track: string } {
  switch (tone) {
    case "light":
      return {
        color: mobileWeb.colors.white,
        labelStyle: { color: "rgba(255, 255, 255, 0.9)" },
        track: "rgba(255, 255, 255, 0.35)",
      };
    case "muted":
      return {
        color: mobileWeb.colors.gray500,
        labelStyle: { color: mobileWeb.colors.gray500 },
        track: "rgba(120, 113, 108, 0.2)",
      };
    case "accent":
      return {
        color: mobileWeb.colors.blue500,
        labelStyle: { color: mobileWeb.colors.blue600 },
        track: "rgba(183, 146, 47, 0.2)",
      };
    default:
      return {
        color: mobileWeb.colors.gray600,
        labelStyle: { color: mobileWeb.colors.gray600 },
        track: "rgba(120, 113, 108, 0.2)",
      };
  }
}

export default function Spinner({ label, size = "sm", tone = "default" }: SpinnerProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const { color, labelStyle, track } = resolveTone(tone);

  const ringSize = size === "lg" ? 24 : 18;
  const borderWidth = size === "lg" ? 3 : 2;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        duration: 800,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      })
    );

    loop.start();

    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [spin]);

  const rotation = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
    [spin]
  );

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.ring,
          {
            borderColor: track,
            borderTopColor: color,
            borderWidth,
            height: ringSize,
            transform: [{ rotate: rotation }],
            width: ringSize,
          },
        ]}
      />
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
  },
  ring: {
    borderRadius: 999,
  },
});
