import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  REPORT_RESPONSE_REASONS,
  type ReportResponseReason,
} from "../lib/reportResponse";
import { mobileWeb } from "../theme/mobileWeb";
import { testIds } from "../testIds";

type ReportResponseModalProps = {
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: ReportResponseReason, note: string) => void;
  pending: boolean;
  submitted: boolean;
  visible: boolean;
};

export default function ReportResponseModal({
  error,
  onClose,
  onSubmit,
  pending,
  submitted,
  visible,
}: ReportResponseModalProps) {
  const [reason, setReason] = useState<ReportResponseReason>("harmful_or_unsafe");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!visible) {
      setReason("harmful_or_unsafe");
      setNote("");
    }
  }, [visible]);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.dialog} testID={testIds.reportResponseModal}>
          {submitted ? (
            <>
              <Text style={styles.title}>Thanks, your report was submitted.</Text>
              <Pressable
                accessibilityLabel="Close report response"
                onPress={onClose}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                testID={testIds.reportResponseDone}
              >
                <Text style={styles.primaryButtonLabel}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Report response</Text>
              <View style={styles.reasonList}>
                {REPORT_RESPONSE_REASONS.map((option) => {
                  const selected = option.value === reason;
                  return (
                    <Pressable
                      accessibilityLabel={option.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={option.value}
                      onPress={() => {
                        setReason(option.value);
                      }}
                      style={({ pressed }) => [
                        styles.reasonButton,
                        selected && styles.reasonButtonSelected,
                        pressed && styles.buttonPressed,
                      ]}
                      testID={`${testIds.reportResponseReason}.${option.value}`}
                    >
                      <Text
                        style={[
                          styles.reasonLabel,
                          selected && styles.reasonLabelSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                maxLength={1000}
                multiline
                onChangeText={setNote}
                placeholder="Optional note"
                placeholderTextColor={mobileWeb.colors.gray500}
                style={styles.noteInput}
                testID={testIds.reportResponseNote}
                textAlignVertical="top"
                value={note}
              />

              {error ? (
                <Text accessibilityRole="alert" style={styles.error} testID={testIds.reportResponseError}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <Pressable
                  accessibilityLabel="Cancel report response"
                  disabled={pending}
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pending && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                  testID={testIds.reportResponseCancel}
                >
                  <Text style={styles.secondaryButtonLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Submit report response"
                  disabled={pending}
                  onPress={() => {
                    onSubmit(reason, note);
                  }}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pending && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                  testID={testIds.reportResponseSubmit}
                >
                  <Text style={styles.primaryButtonLabel}>{pending ? "Submitting..." : "Submit"}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.54,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  dialog: {
    backgroundColor: mobileWeb.colors.surfaceStrong,
    borderColor: mobileWeb.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxWidth: 420,
    padding: 18,
    width: "90%",
  },
  error: {
    color: mobileWeb.colors.red600,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  noteInput: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 8,
    borderWidth: 1,
    color: mobileWeb.colors.gray900,
    fontSize: 15,
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: 14,
  },
  primaryButtonLabel: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  reasonButton: {
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reasonButtonSelected: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue500,
  },
  reasonLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  reasonLabelSelected: {
    color: mobileWeb.colors.blue600,
  },
  reasonList: {
    gap: 8,
  },
  scrim: {
    alignItems: "center",
    backgroundColor: "rgba(28, 25, 23, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: 14,
  },
  secondaryButtonLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    color: mobileWeb.colors.gray900,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
});
