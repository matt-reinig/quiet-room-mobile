import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getPromptCues } from "../promptCues";
import { mobileWeb } from "../theme/mobileWeb";
import { promptCueTestId, testIds } from "../testIds";

type PromptCuesProps = {
  disabled: boolean;
  isAnon: boolean;
  onSelectPrompt?: (prompt: string) => void;
};

export default function PromptCues({ disabled, isAnon, onSelectPrompt }: PromptCuesProps) {
  const [open, setOpen] = useState(false);
  const cues = getPromptCues({ isAnon, variant: "quiet_room" });

  if (!cues.length) {
    return null;
  }

  return (
    <View testID={testIds.promptCuesRoot} style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle prompt cues"
        onPress={() => setOpen((prev) => !prev)}
        testID={testIds.promptCuesToggle}
        style={({ pressed }) => [styles.headerButton, pressed && styles.headerPressed]}
      >
        <Text style={styles.headerLabel}>Prompt cues</Text>
        <Ionicons
          color={mobileWeb.colors.gray500}
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
        />
      </Pressable>

      {open ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          style={styles.panel}
          testID={testIds.promptCuesPanel}
        >
          {cues.map((cue) => (
            <Pressable
              disabled={disabled}
              key={cue.id}
              onPress={() => onSelectPrompt?.(cue.label)}
              testID={promptCueTestId(cue.id)}
              style={({ pressed }) => [
                styles.button,
                disabled && styles.buttonDisabled,
                pressed && !disabled && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonLabel}>{cue.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    lineHeight: 18,
  },
  buttonPressed: {
    backgroundColor: mobileWeb.colors.surface,
  },
  content: {
    flexGrow: 0,
    gap: 8,
    paddingBottom: 0,
  },
  headerButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  headerPressed: {
    opacity: 0.8,
  },
  panel: {
    marginTop: 8,
    maxHeight: 110,
  },
  root: {
    width: "100%",
  },
});
