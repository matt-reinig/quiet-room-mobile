import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { splitTextForSearchHighlight } from "../lib/conversationSearchNavigation";
import { mobileWeb } from "../theme/mobileWeb";
import type { Conversation, ConversationSearchResult } from "../types/chat";
import {
  conversationDeleteButtonTestId,
  conversationMenuButtonTestId,
  conversationRenameButtonTestId,
  conversationRowTestId,
  conversationSearchResultRowTestId,
  conversationSearchSnippetTestId,
  testIds,
} from "../testIds";
import Spinner from "./Spinner";

type ConversationsModalProps = {
  conversations: Conversation[];
  currentId: string | null;
  hasMoreConversations: boolean;
  loading: boolean;
  loadingMore: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onRenameConversation: (conversationId: string, title: string) => Promise<void>;
  onSelectConversation: (conversationId: string) => void;
  onSelectSearchResult: (result: ConversationSearchResult) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: () => Promise<void>;
  onClearSearch: () => void;
  searchEnabled: boolean;
  searchError: string | null;
  searchHasSearched: boolean;
  searchLoading: boolean;
  searchQuery: string;
  searchResults: ConversationSearchResult[];
  visible: boolean;
};

const MENU_PANEL_HEIGHT = 96;
const MENU_PANEL_WIDTH = 156;

type OpenMenuState = {
  id: string;
  left: number;
  top: number;
};

function formatConversationTitle(conversation: Pick<Conversation, "title">): string {
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

type SearchHighlightedTextProps = {
  numberOfLines?: number;
  query: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
  text: string;
};

function SearchHighlightedText({
  numberOfLines,
  query,
  style,
  testID,
  text,
}: SearchHighlightedTextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={style} testID={testID}>
      {splitTextForSearchHighlight(text, query).map((segment, index) => (
        <Text
          key={`${segment.highlighted ? "match" : "text"}-${index}`}
          style={segment.highlighted ? styles.searchHighlight : null}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

export default function ConversationsModal({
  conversations,
  currentId,
  hasMoreConversations,
  loading,
  loadingMore,
  onClose,
  onCreateNew,
  onDeleteConversation,
  onLoadMore,
  onRenameConversation,
  onSelectConversation,
  onSelectSearchResult,
  onSearchQueryChange,
  onSearchSubmit,
  onClearSearch,
  searchEnabled,
  searchError,
  searchHasSearched,
  searchLoading,
  searchQuery,
  searchResults,
  visible,
}: ConversationsModalProps) {
  const insets = useSafeAreaInsets();
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [conversations]);
  const sortedSearchResults = useMemo(() => {
    return [...searchResults].sort((a, b) => {
      const updatedAtDifference = (b.updatedAt || 0) - (a.updatedAt || 0);
      return updatedAtDifference || a.id.localeCompare(b.id);
    });
  }, [searchResults]);
  const showingSearchResults = searchEnabled && searchHasSearched && Boolean(searchQuery.trim());

  const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const [panelWidth, setPanelWidth] = useState(0);
  const panelRef = useRef<View | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const menuButtonRefs = useRef<Record<string, View | null>>({});
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const resetRenameState = () => {
    setRenameTargetId(null);
    setRenameValue("");
    setRenameBusy(false);
    setRenameError(null);
  };

  const closePanel = () => {
    setOpenMenu(null);
    resetRenameState();
    onClose();
  };

  const closeRename = () => {
    resetRenameState();
  };

  const openRename = (conversation: Conversation) => {
    setOpenMenu(null);
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

  const openConversationMenu = useCallback((conversationId: string) => {
    if (openMenu?.id === conversationId) {
      setOpenMenu(null);
      return;
    }

    const button = menuButtonRefs.current[conversationId];
    if (!button || typeof button.measureInWindow !== "function") {
      return;
    }

    if (Platform.OS === "ios") {
      const { height: screenHeight, width: screenWidth } = Dimensions.get("window");

      button.measureInWindow((x, y, width, height) => {
        const maxLeft = Math.max(12, screenWidth - MENU_PANEL_WIDTH - 12);
        const maxTop = Math.max(12, screenHeight - MENU_PANEL_HEIGHT - 12);
        const left = Math.max(12, Math.min(x + width - MENU_PANEL_WIDTH, maxLeft));
        const top = Math.max(12, Math.min(y + height + 8, maxTop));

        setOpenMenu({
          id: conversationId,
          left,
          top,
        });
      });
      return;
    }

    const panel = panelRef.current;
    if (!panel || typeof panel.measureInWindow !== "function") {
      return;
    }

    panel.measureInWindow((panelX, panelY) => {
      button.measureInWindow((x, y, width, height) => {
        const relativeX = x - panelX;
        const relativeY = y - panelY;
        const maxLeft = Math.max(12, panelWidth - MENU_PANEL_WIDTH - 12);
        const maxTop = Math.max(12, panelHeight - MENU_PANEL_HEIGHT - 12);
        const left = Math.max(12, Math.min(relativeX + width - MENU_PANEL_WIDTH, maxLeft));
        const top = Math.max(12, Math.min(relativeY + height + 8, maxTop));

        setOpenMenu({
          id: conversationId,
          left,
          top,
        });
      });
    });
  }, [openMenu?.id, panelHeight, panelWidth]);

  const openMenuConversation = useMemo(() => {
    if (!openMenu) {
      return null;
    }

    return sortedConversations.find((conversation) => conversation.id === openMenu.id) ?? null;
  }, [openMenu, sortedConversations]);

  const maybeLoadMore = useCallback(() => {
    if (!loadingMore && hasMoreConversations) {
      void onLoadMore();
    }
  }, [hasMoreConversations, loadingMore, onLoadMore]);

  return (
    <>
      <Modal
        animationType="fade"
        onRequestClose={renameTargetId ? closeRename : closePanel}
        transparent
        visible={visible}
      >
        <View style={styles.backdrop}>
          <Pressable onPress={closePanel} style={StyleSheet.absoluteFill} />
          <View
            onLayout={(event) => {
              setPanelHeight(event.nativeEvent.layout.height);
              setPanelWidth(event.nativeEvent.layout.width);
            }}
            ref={panelRef}
            style={[
              styles.panel,
              {
                paddingBottom: Math.max(20, insets.bottom + 20),
                paddingTop: Math.max(16, insets.top + 16),
              },
            ]}
            testID={testIds.conversationsPanel}
          >
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Conversations</Text>
                <Pressable hitSlop={14} onPress={closePanel} style={styles.closeButton} testID={testIds.conversationsClose}>
                  <Text style={styles.closeLabel}>Close</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setOpenMenu(null);
                  onCreateNew();
                }}
                style={styles.newChatButton}
                testID={testIds.conversationsNew}
              >
                <Text style={styles.newChatLabel}>+ New chat</Text>
              </Pressable>

              {searchEnabled ? (
                <View style={styles.searchSection}>
                  <Text accessibilityRole="text" style={styles.searchLabel}>
                    Search conversations
                  </Text>
                  <View style={styles.searchRow}>
                    <TextInput
                      accessibilityLabel="Search conversations"
                      editable={!searchLoading}
                      onChangeText={onSearchQueryChange}
                      onSubmitEditing={() => {
                        void onSearchSubmit();
                      }}
                      placeholder="Search messages"
                      returnKeyType="search"
                      style={styles.searchInput}
                      testID={testIds.conversationsSearchInput}
                      value={searchQuery}
                    />
                    {searchQuery ? (
                      <Pressable
                        accessibilityLabel="Clear conversation search"
                        disabled={searchLoading}
                        onPress={onClearSearch}
                        style={styles.searchClearButton}
                        testID={testIds.conversationsSearchClear}
                      >
                        <Text style={styles.searchClearLabel}>Clear</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityLabel="Search conversations"
                      accessibilityRole="button"
                      disabled={searchLoading}
                      onPress={() => {
                        void onSearchSubmit();
                      }}
                      style={styles.searchSubmitButton}
                      testID={testIds.conversationsSearchSubmit}
                    >
                      <Text style={styles.searchSubmitLabel}>Search</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {loading ? (
                <View style={styles.loadingWrap}>
                  <Spinner label="Loading conversations..." tone="accent" />
                </View>
              ) : showingSearchResults && searchLoading ? (
                <View style={styles.loadingWrap} testID={testIds.conversationsSearchLoading}>
                  <Spinner label="Searching conversations..." tone="accent" />
                </View>
              ) : showingSearchResults && searchError ? (
                <View style={styles.statusWrap}>
                  <Text style={styles.errorText} testID={testIds.conversationsSearchError}>
                    {searchError}
                  </Text>
                  <Text style={styles.statusHint}>Use Search to try again.</Text>
                </View>
              ) : (
                <View style={styles.listWrap}>
                  <FlatList<Conversation | ConversationSearchResult>
                    contentContainerStyle={styles.listContent}
                    data={showingSearchResults ? sortedSearchResults : sortedConversations}
                    keyboardShouldPersistTaps="handled"
                    onEndReached={showingSearchResults ? undefined : maybeLoadMore}
                    onEndReachedThreshold={0.35}
                    onScroll={showingSearchResults ? undefined : ({ nativeEvent }) => {
                      const distanceFromBottom =
                        nativeEvent.contentSize.height -
                        (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height);

                      if (distanceFromBottom <= 160) {
                        maybeLoadMore();
                      }
                    }}
                    removeClippedSubviews={false}
                    scrollEventThrottle={16}
                    style={styles.list}
                    testID={testIds.conversationsList}
                    ListEmptyComponent={
                      <View
                        style={styles.emptyWrap}
                        testID={showingSearchResults ? testIds.conversationsSearchNoResults : undefined}
                      >
                        <Text style={styles.emptyText}>
                          {showingSearchResults ? "No matching conversations." : "No conversations yet."}
                        </Text>
                      </View>
                    }
                    ListFooterComponent={
                      !showingSearchResults && loadingMore ? (
                        <View style={styles.listFooterLoading} testID={testIds.conversationsLoadingMore}>
                          <Spinner label="Loading more conversations..." tone="accent" />
                        </View>
                      ) : null
                    }
                    renderItem={({ item }) => {
                    if (showingSearchResults) {
                      const result = item as unknown as ConversationSearchResult;

                      return (
                        <Pressable
                          accessibilityLabel={`Open ${formatConversationTitle(result)}`}
                          onPress={() => {
                            onSelectSearchResult(result);
                          }}
                          style={styles.searchResultRow}
                          testID={conversationSearchResultRowTestId(result.id)}
                        >
                          <SearchHighlightedText
                            numberOfLines={1}
                            query={searchQuery}
                            style={styles.itemTitle}
                            text={formatConversationTitle(result)}
                          />
                          <Text numberOfLines={1} style={styles.itemMeta}>
                            {formatTimestamp(result.updatedAt)}
                          </Text>
                          <SearchHighlightedText
                            numberOfLines={3}
                            query={searchQuery}
                            style={styles.searchSnippet}
                            testID={conversationSearchSnippetTestId(result.id)}
                            text={result.snippet}
                          />
                          {result.matchCount > 1 ? (
                            <Text style={styles.searchMatchCount}>
                              {result.matchCount} matches
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    }

                    const isActive = item.id === currentId;
                    const isMenuOpen = openMenu?.id === item.id;

                    return (
                      <View
                        style={[
                          styles.itemRow,
                          isActive && styles.itemRowActive,
                          isMenuOpen && styles.itemRowMenuOpen,
                          isActive && isMenuOpen && styles.itemRowActiveMenuOpen,
                        ]}
                      >
                        <Pressable
                          onPress={() => {
                            setOpenMenu(null);
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

                        <View
                          collapsable={false}
                          ref={(node) => {
                            menuButtonRefs.current[item.id] = node;
                          }}
                        >
                          <Pressable
                            accessibilityLabel="Conversation options"
                            hitSlop={8}
                            onPress={() => {
                              void openConversationMenu(item.id);
                            }}
                            style={[styles.itemMenuButton, isMenuOpen && styles.itemMenuButtonOpen]}
                            testID={conversationMenuButtonTestId(item.id)}
                          >
                            <Ionicons
                              color={mobileWeb.colors.gray600}
                              name="ellipsis-vertical"
                              size={16}
                            />
                          </Pressable>
                        </View>
                      </View>
                    );
                  }}
                  />
                </View>
              )}
              {Platform.OS !== "ios" && openMenuConversation && openMenu ? (
                <View pointerEvents="box-none" style={styles.menuOverlay}>
                  <Pressable onPress={() => setOpenMenu(null)} style={StyleSheet.absoluteFill} />

                  <View
                    style={[
                      styles.menuPanel,
                      {
                        left: openMenu.left,
                        top: openMenu.top,
                        width: MENU_PANEL_WIDTH,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => openRename(openMenuConversation)}
                      style={styles.menuActionButton}
                      testID={conversationRenameButtonTestId(openMenuConversation.id)}
                    >
                      <Text style={styles.menuActionLabel}>Rename</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setOpenMenu(null);
                        confirmDelete(openMenuConversation.id);
                      }}
                      style={styles.menuActionButton}
                      testID={conversationDeleteButtonTestId(openMenuConversation.id)}
                    >
                      <Text style={styles.menuDeleteLabel}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
          </View>
          {Platform.OS === "ios" && openMenuConversation && openMenu ? (
            <View pointerEvents="box-none" style={styles.menuOverlayScreen}>
              <Pressable onPress={() => setOpenMenu(null)} style={StyleSheet.absoluteFill} />

              <View
                style={[
                  styles.menuPanel,
                  {
                    left: openMenu.left,
                    top: openMenu.top,
                    width: MENU_PANEL_WIDTH,
                  },
                ]}
              >
                <Pressable
                  onPress={() => openRename(openMenuConversation)}
                  style={styles.menuActionButton}
                  testID={conversationRenameButtonTestId(openMenuConversation.id)}
                >
                  <Text style={styles.menuActionLabel}>Rename</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setOpenMenu(null);
                    confirmDelete(openMenuConversation.id);
                  }}
                  style={styles.menuActionButton}
                  testID={conversationDeleteButtonTestId(openMenuConversation.id)}
                >
                  <Text style={styles.menuDeleteLabel}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {renameTargetId ? (
            <View style={styles.renameBackdrop}>
              <Pressable onPress={closeRename} style={StyleSheet.absoluteFill} />

              <View style={styles.renamePanel}>
                <Text style={styles.renameTitle}>Rename conversation</Text>

                <TextInput
                  editable={!renameBusy}
                  onChangeText={setRenameValue}
                  placeholder="Conversation title"
                  style={styles.renameInput}
                  testID={testIds.conversationsRenameInput}
                  value={renameValue}
                />

                {renameError ? <Text style={styles.renameError}>{renameError}</Text> : null}

                <View style={styles.renameActions}>
                  <Pressable
                    disabled={renameBusy}
                    onPress={closeRename}
                    style={styles.renameCancelButton}
                    testID={testIds.conversationsRenameCancel}
                  >
                    <Text style={styles.renameCancelLabel}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    disabled={renameBusy}
                    onPress={() => {
                      void submitRename();
                    }}
                    style={styles.renameSaveButton}
                    testID={testIds.conversationsRenameSave}
                  >
                    <Text style={styles.renameSaveLabel}>{renameBusy ? "Saving..." : "Save"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(17, 24, 39, 0.18)",
    flex: 1,
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
    paddingHorizontal: Platform.OS === "ios" ? 10 : 0,
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
    paddingRight: Platform.OS === "ios" ? 10 : 8,
  },
  itemMenuButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  itemMenuButtonOpen: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
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
    overflow: "visible",
    paddingHorizontal: Platform.OS === "ios" ? 14 : 12,
    paddingVertical: 10,
    position: "relative",
  },
  itemRowActive: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
  },
  itemRowActiveMenuOpen: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray300,
  },
  itemRowMenuOpen: {
    zIndex: 20,
  },
  itemTitle: {
    color: mobileWeb.colors.gray900,
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    color: mobileWeb.colors.red600,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  list: {
    flex: 1,
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: 10,
    paddingBottom: 16,
    paddingHorizontal: Platform.OS === "ios" ? 10 : 0,
  },
  loadingWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 24,
  },
  listFooterLoading: {
    alignItems: "center",
    paddingBottom: 12,
    paddingTop: 8,
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
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    elevation: 30,
    zIndex: 60,
  },
  menuOverlayScreen: {
    ...StyleSheet.absoluteFillObject,
    elevation: 80,
    zIndex: 120,
  },
  menuPanel: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 30,
    padding: 6,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    zIndex: 70,
  },
  newChatButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 12,
    justifyContent: "center",
    marginBottom: 14,
    marginHorizontal: Platform.OS === "ios" ? 10 : 0,
    minHeight: 44,
  },
  newChatLabel: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  searchClearButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 6,
  },
  searchClearLabel: {
    color: mobileWeb.colors.gray500,
    fontSize: 12,
    fontWeight: "600",
  },
  searchInput: {
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 10,
    borderWidth: 1,
    color: mobileWeb.colors.gray900,
    flex: 1,
    fontSize: 14,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  searchHighlight: {
    backgroundColor: mobileWeb.colors.blue200,
    color: mobileWeb.colors.gray900,
    fontWeight: "800",
  },
  searchMatchCount: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    marginTop: 4,
  },
  searchResultRow: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: Platform.OS === "ios" ? 14 : 12,
    paddingVertical: 10,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  searchSection: {
    marginBottom: 14,
    marginHorizontal: Platform.OS === "ios" ? 10 : 0,
  },
  searchSnippet: {
    color: mobileWeb.colors.gray700,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  searchSubmitButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.gray900,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  searchSubmitLabel: {
    color: mobileWeb.colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  statusHint: {
    color: mobileWeb.colors.gray500,
    fontSize: 12,
    marginTop: 6,
  },
  statusWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  panel: {
    alignSelf: "stretch",
    backgroundColor: mobileWeb.colors.white,
    borderRightColor: mobileWeb.colors.gray200,
    borderRightWidth: 1,
    flex: 1,
    maxWidth: Platform.OS === "ios" ? 404 : 380,
    paddingHorizontal: Platform.OS === "ios" ? 18 : 14,
    width: Platform.OS === "ios" ? "84%" : "88%",
  },
  renameActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 16,
  },
  renameBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.35)",
    elevation: 120,
    justifyContent: "center",
    padding: 20,
    zIndex: 200,
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
    elevation: 121,
    maxWidth: 360,
    padding: 18,
    width: "100%",
    zIndex: 201,
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
