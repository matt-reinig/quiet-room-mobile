import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  REPORT_RESPONSE_CONTEXT_SCOPES,
  REPORT_RESPONSE_REASONS,
  type ReportResponseContextScope,
  type ReportResponseReason,
} from "../lib/reportResponse";
import { mobileWeb } from "../theme/mobileWeb";
import { testIds } from "../testIds";

type ReportResponseModalProps = {
  error: string | null;
  onClose: () => void;
  onSubmit: (
    reason: ReportResponseReason,
    note: string,
    contextScope: ReportResponseContextScope
  ) => void;
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
  const [contextScope, setContextScope] =
    useState<ReportResponseContextScope>("metadata_only");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!visible) {
      setReason("harmful_or_unsafe");
      setContextScope("metadata_only");
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
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.formScroll}
                testID={testIds.reportResponseForm}
              >
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Reason</Text>
                  <View style={styles.optionList}>
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
                            styles.optionButton,
                            selected && styles.optionButtonSelected,
                            pressed && styles.buttonPressed,
                          ]}
                          testID={`${testIds.reportResponseReason}.${option.value}`}
                        >
                          <Text
                            style={[
                              styles.optionLabel,
                              selected && styles.optionLabelSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Shared with reviewers</Text>
                  <View style={styles.optionList}>
                    {REPORT_RESPONSE_CONTEXT_SCOPES.map((option) => {
                      const selected = option.value === contextScope;
                      return (
                        <Pressable
                          accessibilityLabel={option.label}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          key={option.value}
                          onPress={() => {
                            setContextScope(option.value);
                          }}
                          style={({ pressed }) => [
                            styles.optionButton,
                            selected && styles.optionButtonSelected,
                            pressed && styles.buttonPressed,
                          ]}
                          testID={`${testIds.reportResponseContextScope}.${option.value}`}
                        >
                          <Text
                            style={[
                              styles.optionLabel,
                              selected && styles.optionLabelSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                          <Text style={styles.optionDescription}>{option.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
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
              </ScrollView>

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
                    onSubmit(reason, note, contextScope);
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
    maxHeight: "86%",
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
  formContent: {
    gap: 14,
    paddingBottom: 8,
  },
  formScroll: {
    flexShrink: 1,
    maxHeight: 440,
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
  optionButton: {
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionButtonSelected: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue500,
  },
  optionDescription: {
    color: mobileWeb.colors.gray600,
    fontSize: 12,
    lineHeight: 16,
  },
  optionLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  optionLabelSelected: {
    color: mobileWeb.colors.blue600,
  },
  optionList: {
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
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: mobileWeb.colors.gray700,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
});
