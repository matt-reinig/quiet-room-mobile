import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { mobileWeb } from "../theme/mobileWeb";

type ChatOptionsModalProps = {
  currentModel: string;
  modelOptions: string[];
  onClose: () => void;
  onSelectModel: (model: string) => void;
  visible: boolean;
  voiceModeAvailable: boolean;
  voiceModeEnabled: boolean;
  onToggleVoiceMode: () => void;
};

function modelLabel(model: string): string {
  if (model === "gpt-5.1-chat-latest") {
    return "GPT-5.1";
  }

  if (model === "gpt-5.3-chat-latest") {
    return "GPT-5.3";
  }

  return model;
}

export default function ChatOptionsModal({
  currentModel,
  modelOptions,
  onClose,
  onSelectModel,
  visible,
  voiceModeAvailable,
  voiceModeEnabled,
  onToggleVoiceMode,
}: ChatOptionsModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />

        <View style={styles.menu}>
          {voiceModeAvailable ? (
            <Pressable onPress={onToggleVoiceMode} style={styles.voiceRow}>
              <View style={styles.voiceCopy}>
                <Text style={styles.voiceTitle}>Voice mode</Text>
                <Text style={styles.voiceSubtitle}>Auto-play replies</Text>
              </View>
              <View
                accessibilityRole="switch"
                accessibilityState={{ checked: voiceModeEnabled }}
                style={[styles.switchTrack, voiceModeEnabled && styles.switchTrackOn]}
              >
                <View style={[styles.switchThumb, voiceModeEnabled && styles.switchThumbOn]} />
              </View>
            </Pressable>
          ) : null}

          {voiceModeAvailable ? <View style={styles.divider} /> : null}

          <Text style={styles.sectionLabel}>MODEL</Text>

          {modelOptions.map((option) => {
            const active = option === currentModel;

            return (
              <Pressable
                key={option}
                onPress={() => onSelectModel(option)}
                style={[styles.modelRow, active ? styles.modelRowActive : styles.modelRowInactive]}
                accessibilityRole="button"
                accessibilityState={{ checked: active }}
              >
                <Text style={[styles.modelRowLabel, active ? styles.modelRowLabelActive : styles.modelRowLabelInactive]}>
                  {modelLabel(option)}
                </Text>
                {active ? <Text style={styles.modelRowBadge}>ACTIVE</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "flex-start",
    backgroundColor: "rgba(28, 25, 23, 0.28)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  divider: {
    backgroundColor: mobileWeb.colors.border,
    height: 1,
    marginVertical: 8,
  },
  menu: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    paddingBottom: 8,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    width: "100%",
  },
  modelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modelRowActive: {
    backgroundColor: mobileWeb.colors.blue50,
  },
  modelRowBadge: {
    color: mobileWeb.colors.blue600,
    fontSize: 11,
    fontWeight: "700",
  },
  modelRowInactive: {
    backgroundColor: mobileWeb.colors.white,
  },
  modelRowLabel: {
    fontSize: 14,
  },
  modelRowLabelActive: {
    color: mobileWeb.colors.blue600,
    fontWeight: "700",
  },
  modelRowLabelInactive: {
    color: mobileWeb.colors.gray700,
    fontWeight: "600",
  },
  sectionLabel: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    paddingBottom: 6,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  switchThumb: {
    backgroundColor: mobileWeb.colors.white,
    borderRadius: 999,
    height: 16,
    transform: [{ translateX: 4 }],
    width: 16,
  },
  switchThumbOn: {
    transform: [{ translateX: 20 }],
  },
  switchTrack: {
    backgroundColor: mobileWeb.colors.gray300,
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: 40,
  },
  switchTrackOn: {
    backgroundColor: mobileWeb.colors.blue600,
  },
  voiceCopy: {
    flex: 1,
  },
  voiceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceSubtitle: {
    color: mobileWeb.colors.gray500,
    fontSize: 12,
  },
  voiceTitle: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
});



