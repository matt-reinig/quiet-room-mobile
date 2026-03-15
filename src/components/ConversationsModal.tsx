import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { mobileWeb } from "../theme/mobileWeb";
import type { Conversation } from "../types/chat";
import {
  conversationDeleteButtonTestId,
  conversationMenuButtonTestId,
  conversationRenameButtonTestId,
  conversationRowTestId,
  testIds,
} from "../testIds";
import Spinner from "./Spinner";

type ConversationsModalProps = {
  conversations: Conversation[];
  currentId: string | null;
  loading: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  onRenameConversation: (conversationId: string, title: string) => Promise<void>;
  onSelectConversation: (conversationId: string) => void;
  visible: boolean;
};

function formatConversationTitle(conversation: Conversation): string {
  const title = typeof conversation.title === "string" ? conversation.title.trim() : "";

  if (title.length > 0) {
    return title;
  }

  return "New Chat";
}

function formatTimestamp(value: number | undefined): string {
  if (!value || Number.isNaN(value)) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}

export default function ConversationsModal({
  conversations,
  currentId,
  loading,
  onClose,
  onCreateNew,
  onDeleteConversation,
  onRenameConversation,
  onSelectConversation,
  visible,
}: ConversationsModalProps) {
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [conversations]);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const closePanel = () => {
    setOpenMenuId(null);
    onClose();
  };

  const closeRename = () => {
    setRenameTargetId(null);
    setRenameValue("");
    setRenameBusy(false);
    setRenameError(null);
  };

  const openRename = (conversation: Conversation) => {
    setOpenMenuId(null);
    setRenameTargetId(conversation.id);
    setRenameValue(formatConversationTitle(conversation));
    setRenameBusy(false);
    setRenameError(null);
  };

  const submitRename = async () => {
    if (!renameTargetId || renameBusy) {
      return;
    }

    const trimmed = renameValue.trim();

    if (!trimmed) {
      setRenameError("Title cannot be empty.");
      return;
    }

    setRenameBusy(true);
    setRenameError(null);

    try {
      await onRenameConversation(renameTargetId, trimmed);
      closeRename();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to rename conversation.";
      setRenameError(message);
      setRenameBusy(false);
    }
  };

  const confirmDelete = (conversationId: string) => {
    Alert.alert("Delete conversation?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void onDeleteConversation(conversationId).catch((error) => {
            const message =
              error instanceof Error ? error.message : "Unable to delete conversation.";
            Alert.alert("Delete failed", message);
          });
        },
      },
    ]);
  };

  return (
    <>
      <Modal animationType="fade" onRequestClose={closePanel} transparent visible={visible}>
        <View style={styles.backdrop}>
          <Pressable onPress={closePanel} style={styles.overlay} />

          <SafeAreaView style={styles.panel} testID={testIds.conversationsPanel}>
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Conversations</Text>
              <Pressable hitSlop={14} onPress={closePanel} style={styles.closeButton} testID={testIds.conversationsClose}>
                <Text style={styles.closeLabel}>Close</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                setOpenMenuId(null);
                onCreateNew();
              }}
              style={styles.newChatButton}
              testID={testIds.conversationsNew}
            >
              <Text style={styles.newChatLabel}>+ New chat</Text>
            </Pressable>

            {loading ? (
              <View style={styles.loadingWrap}>
                <Spinner label="Loading conversations..." tone="accent" />
              </View>
            ) : (
              <FlatList
                contentContainerStyle={styles.listContent}
                data={sortedConversations}
                keyboardShouldPersistTaps="handled"
                testID={testIds.conversationsList}
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>No conversations yet.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isActive = item.id === currentId;
                  const isMenuOpen = openMenuId === item.id;

                  return (
                    <View style={[styles.itemRow, isActive && styles.itemRowActive]}>
                      <Pressable
                        onPress={() => {
                          setOpenMenuId(null);
                          onSelectConversation(item.id);
                        }}
                        style={styles.itemMainButton}
                        testID={conversationRowTestId(item.id)}
                      >
                        <Text numberOfLines={1} style={styles.itemTitle}>
                          {formatConversationTitle(item)}
                        </Text>
                        <Text numberOfLines={1} style={styles.itemMeta}>
                          {formatTimestamp(item.updatedAt)}
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityLabel="Conversation options"
                        hitSlop={8}
                        onPress={() =>
                          setOpenMenuId((prev) => (prev === item.id ? null : item.id))
                        }
                        style={styles.itemMenuButton}
                        testID={conversationMenuButtonTestId(item.id)}
                      >
                        <Ionicons
                          color={mobileWeb.colors.gray600}
                          name="ellipsis-vertical"
                          size={16}
                        />
                      </Pressable>

                      {isMenuOpen ? (
                        <View style={styles.menuPanel}>
                          <Pressable
                            onPress={() => openRename(item)}
                            style={styles.menuActionButton}
                            testID={conversationRenameButtonTestId(item.id)}
                          >
                            <Text style={styles.menuActionLabel}>Rename</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setOpenMenuId(null);
                              confirmDelete(item.id);
                            }}
                            style={styles.menuActionButton}
                            testID={conversationDeleteButtonTestId(item.id)}
                          >
                            <Text style={styles.menuDeleteLabel}>Delete</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                }}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closeRename}
        transparent
        visible={Boolean(renameTargetId)}
      >
        <View style={styles.renameBackdrop}>
          <Pressable onPress={closeRename} style={StyleSheet.absoluteFill} />

          <View style={styles.renamePanel}>
            <Text style={styles.renameTitle}>Rename conversation</Text>

            <TextInput
              editable={!renameBusy}
              onChangeText={setRenameValue}
              placeholder="Conversation title"
              style={styles.renameInput}
              testID="quiet-room.conversations.rename.input"
              value={renameValue}
            />

            {renameError ? <Text style={styles.renameError}>{renameError}</Text> : null}

            <View style={styles.renameActions}>
              <Pressable
                disabled={renameBusy}
                onPress={closeRename}
                style={styles.renameCancelButton}
                testID="quiet-room.conversations.rename.cancel"
              >
                <Text style={styles.renameCancelLabel}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={renameBusy}
                onPress={() => {
                  void submitRename();
                }}
                style={styles.renameSaveButton}
                testID="quiet-room.conversations.rename.save"
              >
                <Text style={styles.renameSaveLabel}>{renameBusy ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: "row",
  },
  closeButton: {
    alignItems: "center",
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 68,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  closeLabel: {
    color: mobileWeb.colors.gray600,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyText: {
    color: mobileWeb.colors.gray500,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    color: mobileWeb.colors.gray900,
    fontSize: 22,
    fontWeight: "700",
  },
  itemMainButton: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 48,
    paddingRight: 8,
  },
  itemMenuButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  itemMeta: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
  },
  itemRow: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: "relative",
  },
  itemRowActive: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
  },
  itemTitle: {
    color: mobileWeb.colors.gray900,
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    gap: 10,
    paddingBottom: 16,
  },
  loadingWrap: {
    paddingVertical: 24,
  },
  menuActionButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  menuActionLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 13,
    fontWeight: "600",
  },
  menuDeleteLabel: {
    color: mobileWeb.colors.red600,
    fontSize: 13,
    fontWeight: "600",
  },
  menuPanel: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 12,
    borderWidth: 1,
    padding: 6,
    position: "absolute",
    right: 8,
    top: 50,
    zIndex: 10,
  },
  newChatButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 12,
    justifyContent: "center",
    marginBottom: 14,
    minHeight: 44,
  },
  newChatLabel: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  overlay: {
    flex: 1,
  },
  panel: {
    alignSelf: "stretch",
    backgroundColor: mobileWeb.colors.white,
    borderLeftColor: mobileWeb.colors.gray200,
    borderLeftWidth: 1,
    maxWidth: Platform.OS === "ios" ? 420 : 380,
    paddingBottom: 20,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 16 : 36,
    width: "88%",
  },
  renameActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 16,
  },
  renameBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.35)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  renameCancelButton: {
    alignItems: "center",
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 74,
    paddingHorizontal: 14,
  },
  renameCancelLabel: {
    color: mobileWeb.colors.gray600,
    fontWeight: "600",
  },
  renameError: {
    color: mobileWeb.colors.red600,
    fontSize: 13,
    marginTop: 8,
  },
  renameInput: {
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 12,
    borderWidth: 1,
    color: mobileWeb.colors.gray900,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renamePanel: {
    backgroundColor: mobileWeb.colors.white,
    borderRadius: 18,
    padding: 18,
    width: "100%",
  },
  renameSaveButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 74,
    paddingHorizontal: 14,
  },
  renameSaveLabel: {
    color: mobileWeb.colors.white,
    fontWeight: "700",
  },
  renameTitle: {
    color: mobileWeb.colors.gray900,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
});
