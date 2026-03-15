import { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CONTACT_EMAIL } from "../config/env";
import { getPromptCues } from "../promptCues";

type AboutModalProps = {
  isAnon: boolean;
  onClose?: () => void;
  visible: boolean;
};

export default function AboutModal({ isAnon, onClose, visible }: AboutModalProps) {
  const promptCues = useMemo(
    () => getPromptCues({ isAnon, variant: "quiet_room" }),
    [isAnon]
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />

        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopyWrap}>
              <Text style={styles.title}>About Quiet Room</Text>
              <Text style={styles.subtitle}>A quiet space to return to.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonLabel}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.paragraph}>
              Quiet Room is a quiet, digital space designed to support your
              relationship with Jesus.
            </Text>

            <Text style={styles.paragraph}>
              Here, gentle, faithful reflection and counsel drawn from Scripture and
              the Catholic tradition are offered in a way meant to support prayerful
              attentiveness and discernment.
            </Text>

            <Text style={styles.paragraph}>
              Quiet Room is not meant to replace prayer, Scripture, the sacraments,
              or spiritual direction. It is a tool intended to support reflection,
              steadiness, and faithful orientation, especially in moments that feel
              heavy, unclear, or unresolved.
            </Text>

            <Text style={styles.sectionTitle}>How to use Quiet Room</Text>

            <Text style={styles.paragraph}>
              You do not need to know what to ask or how to begin.
            </Text>

            <Text style={styles.paragraph}>
              You are welcome to bring questions, struggles, gratitude, or
              situations you are trying to understand faithfully.
            </Text>

            <Text style={styles.paragraph}>
              {isAnon
                ? "When you are signed in, Quiet Room can retain continuity across conversations so reflection does not need to restart each time."
                : "Because you are signed in, Quiet Room can retain continuity across conversations so reflection does not need to restart each time."}
            </Text>

            <Text style={styles.paragraph}>
              Responses are AI-generated and offered as support, not authority.
              Please rely on your own discernment and seek pastoral or
              professional care when appropriate.
            </Text>

            <Text style={styles.sectionTitle}>Sample prompts</Text>

            {promptCues.map((cue) => (
              <Text key={cue.id} style={styles.bullet}>
                ? {cue.label}
              </Text>
            ))}

            <Text style={styles.sectionTitle}>Contact and feedback</Text>

            <Text style={styles.paragraph}>
              If you have ideas, questions, or would like to share how Quiet Room
              has been part of your reflection or prayer, I would love to hear
              from you.
            </Text>

            <Text style={styles.email}>Email: {CONTACT_EMAIL}</Text>

            <Text style={styles.paragraph}>Thank you for being here.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.35)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  body: {
    gap: 10,
    paddingBottom: 8,
  },
  bullet: {
    color: "#111827",
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    borderColor: "#D1D5DB",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  closeButtonLabel: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "600",
  },
  email: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "600",
  },
  headerCopyWrap: {
    flex: 1,
    gap: 2,
  },
  headerRow: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  paragraph: {
    color: "#111827",
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    gap: 12,
    maxHeight: "84%",
    maxWidth: 520,
    padding: 14,
    width: "100%",
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 12,
  },
  title: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
});
