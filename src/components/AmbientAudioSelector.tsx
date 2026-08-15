import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AMBIENT_AUDIO_OPTIONS,
  ambientAudioLabel,
  type AmbientAudioEnvironment,
} from "../lib/ambientAudio";
import {
  ambientAudioOptionTestId,
  testIds,
} from "../testIds";
import { mobileWeb } from "../theme/mobileWeb";

type AmbientAudioSelectorProps = {
  hydrated: boolean;
  onSelect: (environment: AmbientAudioEnvironment) => void;
  playbackStatus: "error" | "off" | "paused" | "playing" | "starting";
  selectedEnvironment: AmbientAudioEnvironment;
};

export default function AmbientAudioSelector({
  hydrated,
  onSelect,
  playbackStatus,
  selectedEnvironment,
}: AmbientAudioSelectorProps) {
  return (
    <View style={styles.root} testID={testIds.ambientAudioSelector}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>AMBIENCE</Text>
          <Text style={styles.subheading}>A quiet background for the room</Text>
        </View>
        {selectedEnvironment !== "off" ? (
          <Text style={styles.status} testID={testIds.ambientAudioStatus}>
            {`${ambientAudioLabel(selectedEnvironment)} ${
              playbackStatus === "error" ? "unavailable" : playbackStatus
            }`}
          </Text>
        ) : null}
      </View>

      {AMBIENT_AUDIO_OPTIONS.map((option) => {
        const selected = option.environment === selectedEnvironment;

        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !hydrated }}
            disabled={!hydrated}
            key={option.environment}
            onPress={() => onSelect(option.environment)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && hydrated && styles.optionPressed,
            ]}
            testID={ambientAudioOptionTestId(option.environment)}
          >
            <View style={styles.optionCopy}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </View>
            {selected ? (
              <Ionicons name="checkmark-circle" size={19} color={mobileWeb.colors.blue600} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  headingRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  option: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  optionCopy: {
    flex: 1,
  },
  optionDescription: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    lineHeight: 15,
  },
  optionLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  optionLabelSelected: {
    color: mobileWeb.colors.blue600,
  },
  optionPressed: {
    backgroundColor: mobileWeb.colors.surface,
  },
  optionSelected: {
    backgroundColor: mobileWeb.colors.blue50,
  },
  root: {
    paddingBottom: 4,
  },
  status: {
    color: mobileWeb.colors.blue600,
    fontSize: 11,
    fontWeight: "700",
  },
  subheading: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
});
