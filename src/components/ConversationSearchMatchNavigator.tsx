import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileWeb } from "../theme/mobileWeb";
import { testIds } from "../testIds";

type ConversationSearchMatchNavigatorProps = {
  onDismiss: () => void;
  onNext: () => void;
  onPrevious: () => void;
  query: string;
  selectedPosition: number;
  totalMatches: number;
};

function displayQuery(query: string): string {
  const trimmed = query.trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
}

export default function ConversationSearchMatchNavigator({
  onDismiss,
  onNext,
  onPrevious,
  query,
  selectedPosition,
  totalMatches,
}: ConversationSearchMatchNavigatorProps) {
  const isFirst = selectedPosition <= 0;
  const isLast = selectedPosition >= totalMatches - 1;

  return (
    <View
      accessibilityLabel={`Search match ${selectedPosition + 1} of ${totalMatches}`}
      style={styles.container}
      testID={testIds.conversationSearchNavigator}
    >
      <View style={styles.copyBlock}>
        <Text numberOfLines={1} style={styles.query}>
          “{displayQuery(query)}”
        </Text>
        <Text style={styles.ordinal} testID={testIds.conversationSearchOrdinal}>
          Match {selectedPosition + 1} of {totalMatches}
        </Text>
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityLabel="Previous search match"
          accessibilityRole="button"
          disabled={isFirst}
          onPress={onPrevious}
          style={[styles.control, isFirst && styles.controlDisabled]}
          testID={testIds.conversationSearchPrevious}
        >
          <Text style={styles.controlLabel}>Previous</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Next search match"
          accessibilityRole="button"
          disabled={isLast}
          onPress={onNext}
          style={[styles.control, isLast && styles.controlDisabled]}
          testID={testIds.conversationSearchNext}
        >
          <Text style={styles.controlLabel}>Next</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Dismiss search match navigation"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          style={styles.dismiss}
          testID={testIds.conversationSearchDismiss}
        >
          <Text style={styles.dismissLabel}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.surface,
    borderBottomColor: mobileWeb.colors.gray200,
    borderBottomWidth: 1,
    borderTopColor: mobileWeb.colors.gray200,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyBlock: {
    flex: 1,
    minWidth: 0,
  },
  control: {
    alignItems: "center",
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 8,
  },
  controlDisabled: {
    opacity: 0.42,
  },
  controlLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 11,
    fontWeight: "700",
  },
  controls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  dismiss: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 4,
  },
  dismissLabel: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    fontWeight: "600",
  },
  ordinal: {
    color: mobileWeb.colors.gray600,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  query: {
    color: mobileWeb.colors.gray700,
    fontSize: 12,
    fontWeight: "600",
  },
});
