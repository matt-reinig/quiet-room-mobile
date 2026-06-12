import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  Keyboard,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AboutModal from "../components/AboutModal";
import ConversationsModal from "../components/ConversationsModal";
import LoginModal from "../components/LoginModal";
import MessageBubble from "../components/MessageBubble";
import PromptCues from "../components/PromptCues";
import ReportResponseModal from "../components/ReportResponseModal";
import Spinner from "../components/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureFlag } from "../contexts/FeatureFlagsContext";
import { useChatController } from "../hooks/useChatController";
import { getAiConsentAccepted, setAiConsentAccepted } from "../lib/aiConsent";
import { labelForChatModel } from "../lib/chatModels";
import {
  submitResponseReport,
  type ReportResponseContextScope,
  type ReportResponseReason,
} from "../lib/reportResponse";
import { mobileWeb } from "../theme/mobileWeb";
import { messageBubbleTestId, modelOptionTestId, testIds } from "../testIds";
import type { ChatMessage } from "../types/chat";

const VOICE_MODE_STORAGE_KEY = "gabriel.voiceModeEnabled";
const USER_ANCHOR_TOP_OFFSET = 6;
const MESSAGE_LIST_PADDING_TOP = 0;
const MESSAGE_LIST_PADDING_BOTTOM = 104;
const COMPOSER_ROW_PADDING_TOP = 12;
const COMPOSER_ROW_PADDING_BOTTOM = 16;
const COMPOSER_META_ROW_HEIGHT = 32;
const COMPOSER_META_ROW_GAP = 8;
const COMPOSER_RESTING_BOTTOM_PADDING = COMPOSER_ROW_PADDING_TOP + COMPOSER_META_ROW_HEIGHT + COMPOSER_META_ROW_GAP;
const OPENING_MESSAGE_TOP_OFFSET = 16;
const ANDROID_KEYBOARD_INPUT_CLEARANCE = 4;
const ANDROID_KEYBOARD_FALLBACK_SCREEN_RATIO = 0.35;

function androidRestingComposerBottomPadding(bottomInset: number): number {
  return Math.max(0, COMPOSER_RESTING_BOTTOM_PADDING - bottomInset);
}

const QUIET_ROOM_OPENING_GREETING = `Welcome to Quiet Room.

A quiet space to support your relationship with Jesus.

You're welcome to remain in silence, or to bring whatever feels present.`;

type VoiceAutoPlayTarget = {
  content: string;
  conversationId: string | null;
  index: number;
};

type RenderMessage = {
  autoPlayVoice: boolean;
  conversationId: string | null;
  id: string;
  message: ChatMessage;
  messageIndex: number | null;
};

type ReportResponseTarget = {
  assistantMessageId: string;
  assistantMessageIndex: number;
  conversationId: string;
};

function headerTopPadding(): number {
  return Platform.OS === "ios" ? 84 : 12;
}

function headerControlsTop(): number {
  return Platform.OS === "ios" ? 16 : 8;
}

function headerTitleTop(): number {
  return Platform.OS === "ios" ? 24 : 12;
}

function crucifixTopMargin(): number {
  return Platform.OS === "ios" ? 0 : 76;
}

function keyboardInsetFromScreenY(height: number | undefined, screenY: number | undefined): number {
  const measuredScreenY = screenY && screenY > 0
    ? Math.max(0, Dimensions.get("screen").height - screenY)
    : 0;

  if (measuredScreenY > 0) {
    return measuredScreenY;
  }

  return height && height > 0 ? height : 0;
}

export default function QuietRoomScreen() {
  const { deleteAccount, isAnon, logout, user } = useAuth();
  const voiceModeAvailable = useFeatureFlag("voice_mode", false);
  const insets = useSafeAreaInsets();

  const {
    chatLoading,
    conversationList,
    createNewChat,
    currentId,
    currentModel,
    deleteConversation,
    hasMoreConversations,
    input,
    isNewChat,
    loadMoreConversations,
    loading,
    loadingMoreConversations,
    messages,
    modelOptions,
    renameConversation,
    sendMessage,
    setCurrentId,
    setCurrentModel,
    setInput,
    shouldBlockForConversations,
    showThinking,
    sidebarLoading,
  } = useChatController({ isAnon, user });
  const showModelSection = modelOptions.length > 1;
  const showChatOptionsButton = voiceModeAvailable || showModelSection;
  const composerModelLabel = showChatOptionsButton
    ? labelForChatModel(currentModel, modelOptions)
    : "";

  const [showAbout, setShowAbout] = useState(false);
  const [showCrucifix, setShowCrucifix] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAiConsentModal, setShowAiConsentModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showComposerFullscreen, setShowComposerFullscreen] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [aiConsentAcceptedState, setAiConsentAcceptedState] = useState(false);
  const [aiConsentLoaded, setAiConsentLoaded] = useState(false);
  const [aiConsentPending, setAiConsentPending] = useState<string | null>(null);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [showNewestButton, setShowNewestButton] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [deleteAccountPending, setDeleteAccountPending] = useState(false);
  const [reportResponseTarget, setReportResponseTarget] = useState<ReportResponseTarget | null>(null);
  const [reportResponseError, setReportResponseError] = useState<string | null>(null);
  const [reportResponsePending, setReportResponsePending] = useState(false);
  const [reportResponseSubmitted, setReportResponseSubmitted] = useState(false);

  const [voiceAutoPlayTarget, setVoiceAutoPlayTarget] = useState<VoiceAutoPlayTarget | null>(null);

  const [composerVisibleLines, setComposerVisibleLines] = useState(1);
  const [anchorContentMinHeight, setAnchorContentMinHeight] = useState(0);


  const hasHydratedVoiceModeRef = useRef(false);
  const lastVoiceAutoPlayKeyRef = useRef<string | null>(null);
  const prevLoadingRef = useRef(loading);
  const prevMessagesRef = useRef<ChatMessage[]>(messages);
  const inputValueRef = useRef(input);
  const composerInputRef = useRef<TextInput>(null);
  const listRef = useRef<ScrollView>(null);
  const isNearBottomRef = useRef(true);
  const scrollAnchorTopRef = useRef<number | null>(null);
  const pendingAnchorScrollRef = useRef(false);
  const pendingSendScrollRef = useRef(false);
  const lastSendScrollKeyRef = useRef<string | null>(null);
  const messageOffsetsRef = useRef<Record<string, number>>({});
  const anchorScrollRetryCountRef = useRef(0);
  const currentScrollOffsetRef = useRef(0);
  const listViewportHeightRef = useRef(0);
  const listContentHeightRef = useRef(0);
  const anchorContentMinHeightRef = useRef(0);
  const newestButtonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardFocusFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const maybeKeepLatestVisible = () => {
      if (
        !isNearBottomRef.current ||
        pendingSendScrollRef.current ||
        pendingAnchorScrollRef.current ||
        typeof scrollAnchorTopRef.current === "number" ||
        anchorContentMinHeightRef.current > 0
      ) {
        return;
      }

      requestAnimationFrame(() => {
        scrollToLatest(false);
      });
    };

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setIsKeyboardVisible(true);
      setKeyboardInset(keyboardInsetFromScreenY(
        event.endCoordinates.height,
        event.endCoordinates.screenY,
      ));
      maybeKeepLatestVisible();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardInset(0);
      maybeKeepLatestVisible();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (newestButtonTimeoutRef.current) {
        clearTimeout(newestButtonTimeoutRef.current);
      }

      if (keyboardFocusFallbackTimeoutRef.current) {
        clearTimeout(keyboardFocusFallbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setShowAiConsentModal(false);
    setAiConsentPending(null);
    setAiConsentLoaded(false);

    const hydrateAiConsent = async () => {
      const accepted = await getAiConsentAccepted(user);

      if (cancelled) {
        return;
      }

      setAiConsentAcceptedState(accepted);
      setAiConsentLoaded(true);
    };

    void hydrateAiConsent();

    return () => {
      cancelled = true;
    };
  }, [user?.isAnonymous, user?.uid]);

  useEffect(() => {
    const hydrateVoiceModePreference = async () => {
      try {
        const value = await AsyncStorage.getItem(VOICE_MODE_STORAGE_KEY);
        setVoiceModeEnabled(value === "1");
      } catch {
        setVoiceModeEnabled(false);
      } finally {
        hasHydratedVoiceModeRef.current = true;
      }
    };

    void hydrateVoiceModePreference();
  }, []);

  useEffect(() => {
    if (!hasHydratedVoiceModeRef.current) {
      return;
    }

    AsyncStorage.setItem(VOICE_MODE_STORAGE_KEY, voiceModeEnabled ? "1" : "0").catch(() => {
      // Intentionally ignored.
    });
  }, [voiceModeEnabled]);

  useEffect(() => {
    if (!showChatOptionsButton && showChatOptions) {
      setShowChatOptions(false);
    }
  }, [showChatOptions, showChatOptionsButton]);

  const closeReportResponse = useCallback(() => {
    if (reportResponsePending) {
      return;
    }

    setReportResponseTarget(null);
    setReportResponseError(null);
    setReportResponseSubmitted(false);
  }, [reportResponsePending]);

  const openReportResponse = useCallback(
    (target: { conversationId: string; message: ChatMessage; messageIndex: number }) => {
      if (!target.conversationId || target.message.role !== "assistant") {
        return;
      }

      setReportResponseTarget({
        assistantMessageId: `${target.conversationId}:${target.messageIndex}`,
        assistantMessageIndex: target.messageIndex,
        conversationId: target.conversationId,
      });
      setReportResponseError(null);
      setReportResponseSubmitted(false);
    },
    []
  );

  const submitReportResponse = useCallback(
    async (
      reason: ReportResponseReason,
      note: string,
      contextScope: ReportResponseContextScope
    ) => {
      if (!user || !reportResponseTarget || reportResponsePending) {
        return;
      }

      setReportResponsePending(true);
      setReportResponseError(null);

      try {
        await submitResponseReport({
          ...reportResponseTarget,
          contextScope,
          note,
          reason,
          user,
        });
        setReportResponseSubmitted(true);
      } catch {
        setReportResponseError("Unable to submit this report. Please try again.");
      } finally {
        setReportResponsePending(false);
      }
    },
    [reportResponsePending, reportResponseTarget, user]
  );

  useEffect(() => {
    lastVoiceAutoPlayKeyRef.current = null;
    setVoiceAutoPlayTarget(null);
    prevLoadingRef.current = loading;
    prevMessagesRef.current = messages;

    const preservePendingSendAnchor =
      pendingSendScrollRef.current ||
      pendingAnchorScrollRef.current ||
      typeof scrollAnchorTopRef.current === "number" ||
      anchorContentMinHeightRef.current > 0;

    if (preservePendingSendAnchor) {
      return;
    }

    messageOffsetsRef.current = {};
    currentScrollOffsetRef.current = 0;
    listViewportHeightRef.current = 0;
    listContentHeightRef.current = 0;
    scrollAnchorTopRef.current = null;
    pendingAnchorScrollRef.current = false;
    pendingSendScrollRef.current = false;
    lastSendScrollKeyRef.current = null;
    anchorScrollRetryCountRef.current = 0;
    anchorContentMinHeightRef.current = 0;
    setAnchorContentMinHeight(0);
    setShowScrollTopButton(false);

    if (newestButtonTimeoutRef.current) {
      clearTimeout(newestButtonTimeoutRef.current);
      newestButtonTimeoutRef.current = null;
    }

    setShowNewestButton(false);
  }, [currentId]);

  useEffect(() => {
    const prevLoading = prevLoadingRef.current;
    const prevMessages = prevMessagesRef.current;

    const currentMessages = Array.isArray(messages) ? messages : [];
    const lastIndex = currentMessages.length - 1;
    const lastMessage = lastIndex >= 0 ? currentMessages[lastIndex] : null;

    const prevLastMessage = prevMessages.length ? prevMessages[prevMessages.length - 1] : null;

    const finishedLoading = prevLoading && !loading;
    const finishedStreaming =
      prevLastMessage?.role === "assistant" &&
      prevLastMessage?.isStreaming &&
      lastMessage?.role === "assistant" &&
      !lastMessage?.isStreaming;

    const finishedReply = finishedLoading || finishedStreaming;
    const shouldReleaseSendAnchor =
      finishedReply &&
      (pendingSendScrollRef.current ||
        pendingAnchorScrollRef.current ||
        typeof scrollAnchorTopRef.current === "number" ||
        anchorContentMinHeightRef.current > 0);

    if (shouldReleaseSendAnchor) {
      clearAnchorState();

      const hasMeasuredViewport =
        listContentHeightRef.current > 0 && listViewportHeightRef.current > 0;
      const nearBottom = hasMeasuredViewport
        ? listContentHeightRef.current - (currentScrollOffsetRef.current + listViewportHeightRef.current) < 80
        : isNearBottomRef.current;

      isNearBottomRef.current = nearBottom;
      setShowScrollTopButton(currentScrollOffsetRef.current > 40);

      if (newestButtonTimeoutRef.current) {
        clearTimeout(newestButtonTimeoutRef.current);
        newestButtonTimeoutRef.current = null;
      }

      setShowNewestButton(!nearBottom);
    }

    if (
      voiceModeAvailable &&
      voiceModeEnabled &&
      (finishedLoading || finishedStreaming) &&
      lastMessage?.role === "assistant" &&
      !lastMessage?.isStreaming &&
      typeof lastMessage.content === "string" &&
      lastMessage.content.trim()
    ) {
      const autoKey = `${currentId ?? "new"}:${lastIndex}:${lastMessage.content.length}`;

      if (lastVoiceAutoPlayKeyRef.current !== autoKey) {
        lastVoiceAutoPlayKeyRef.current = autoKey;

        setVoiceAutoPlayTarget({
          content: lastMessage.content,
          conversationId: currentId ?? null,
          index: lastIndex,
        });
      }
    }

    prevLoadingRef.current = loading;
    prevMessagesRef.current = currentMessages;
  }, [clearAnchorState, currentId, loading, messages, scrollToLatest, voiceModeAvailable, voiceModeEnabled]);

  const renderedMessages = useMemo<RenderMessage[]>(() => {
    const opening: RenderMessage = {
      autoPlayVoice: false,
      conversationId: null,
      id: "opening",
      message: {
        content: QUIET_ROOM_OPENING_GREETING,
        role: "assistant",
      },
      messageIndex: null,
    };

    const mapped = messages.map((message, index) => {
      const autoPlayVoice =
        voiceModeAvailable &&
        voiceModeEnabled &&
        voiceAutoPlayTarget?.conversationId === (currentId ?? null) &&
        voiceAutoPlayTarget?.index === index &&
        voiceAutoPlayTarget?.content === message.content;

      return {
        autoPlayVoice,
        conversationId: currentId ?? null,
        id: `${index}:${message.role}:${message.content.length}:${message.isStreaming ? "1" : "0"}`,
        message,
        messageIndex: index,
      };
    });

    return [opening, ...mapped];
  }, [currentId, messages, voiceAutoPlayTarget, voiceModeAvailable, voiceModeEnabled]);

  const showPromptCues =
    Boolean(isNewChat) && !chatLoading && messages.length === 0 && !isKeyboardVisible;

  const hideNewestButton = useCallback(() => {
    if (newestButtonTimeoutRef.current) {
      clearTimeout(newestButtonTimeoutRef.current);
      newestButtonTimeoutRef.current = null;
    }

    setShowNewestButton(false);
  }, []);

  const queueNewestButton = useCallback(() => {
    if (newestButtonTimeoutRef.current) {
      return;
    }

    newestButtonTimeoutRef.current = setTimeout(() => {
      newestButtonTimeoutRef.current = null;
      setShowNewestButton(true);
    }, 400);
  }, []);

  function clearAnchorState() {
    scrollAnchorTopRef.current = null;
    pendingAnchorScrollRef.current = false;
    pendingSendScrollRef.current = false;
    lastSendScrollKeyRef.current = null;
    anchorScrollRetryCountRef.current = 0;
    anchorContentMinHeightRef.current = 0;
    setAnchorContentMinHeight(0);
  }

  const isEffectivelyNearBottom = useCallback(
    (
      contentHeight = listContentHeightRef.current,
      viewportHeight = listViewportHeightRef.current,
      offsetY = currentScrollOffsetRef.current
    ) => {
      if (contentHeight <= 0 || viewportHeight <= 0) {
        return isNearBottomRef.current;
      }

      return contentHeight - (offsetY + viewportHeight) < 80;
    },
    []
  );

  const syncAnchorMinHeight = useCallback((anchorTop: number | null = scrollAnchorTopRef.current) => {
    if (typeof anchorTop !== "number") {
      return false;
    }

    const viewportHeight = listViewportHeightRef.current;
    if (viewportHeight <= 0) {
      return false;
    }

    const nextMinHeight = Math.max(
      0,
      Math.ceil(viewportHeight + anchorTop - MESSAGE_LIST_PADDING_TOP - MESSAGE_LIST_PADDING_BOTTOM)
    );

    if (anchorContentMinHeightRef.current !== nextMinHeight) {
      anchorContentMinHeightRef.current = nextMinHeight;
      setAnchorContentMinHeight(nextMinHeight);
    }

    return true;
  }, []);

  const scrollListTo = useCallback((y: number, animated = false) => {
    listRef.current?.scrollTo({
      animated,
      x: 0,
      y,
    });
  }, []);

  const syncAnchorScroll = useCallback((animated = false) => {
    const anchorTop = scrollAnchorTopRef.current;

    if (typeof anchorTop !== "number") {
      pendingAnchorScrollRef.current = false;
      anchorScrollRetryCountRef.current = 0;
      return;
    }

    const viewportHeight = listViewportHeightRef.current;
    const contentHeight = listContentHeightRef.current;

    if (viewportHeight <= 0 || contentHeight <= 0) {
      pendingAnchorScrollRef.current = true;
      return;
    }

    const maxScrollTop = Math.max(0, contentHeight - viewportHeight);
    const nextTop = Math.max(0, Math.min(anchorTop, maxScrollTop));
    const needsMoreScrollableHeight = nextTop + 1 < anchorTop;
    const needsScrollAdjustment = Math.abs(currentScrollOffsetRef.current - nextTop) >= 1;

    if (needsMoreScrollableHeight) {
      pendingAnchorScrollRef.current = true;
      return;
    }

    if (!needsScrollAdjustment) {
      pendingAnchorScrollRef.current = false;
      anchorScrollRetryCountRef.current = 0;
      return;
    }

    pendingAnchorScrollRef.current = true;
    scrollListTo(nextTop, animated);

    const retryCount = anchorScrollRetryCountRef.current + 1;
    anchorScrollRetryCountRef.current = retryCount;

    requestAnimationFrame(() => {
      const settled = Math.abs(currentScrollOffsetRef.current - nextTop) < 1;
      if (settled || retryCount >= 4) {
        pendingAnchorScrollRef.current = false;
        anchorScrollRetryCountRef.current = 0;
        return;
      }

      syncAnchorScroll(false);
    });
  }, [scrollListTo]);

  const tryResolvePendingSendAnchor = useCallback(() => {
    if (!pendingSendScrollRef.current) {
      return false;
    }

    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") {
        lastUserIndex = index;
        break;
      }
    }

    if (lastUserIndex < 0) {
      pendingSendScrollRef.current = false;
      return true;
    }

    const lastUser = messages[lastUserIndex];
    const contentLength = typeof lastUser?.content === "string" ? lastUser.content.length : 0;
    const scrollKey = `${currentId ?? "new"}:${lastUserIndex}:${contentLength}`;

    if (lastSendScrollKeyRef.current === scrollKey) {
      pendingSendScrollRef.current = false;
      return true;
    }

    const anchorRenderId = renderedMessages[lastUserIndex + 1]?.id;
    if (!anchorRenderId) {
      return false;
    }

    const anchorOffset = messageOffsetsRef.current[anchorRenderId];
    if (typeof anchorOffset !== "number") {
      return false;
    }

    const desiredTop = Math.max(0, anchorOffset - USER_ANCHOR_TOP_OFFSET);
    scrollAnchorTopRef.current = desiredTop;

    if (!syncAnchorMinHeight(desiredTop)) {
      return false;
    }

    lastSendScrollKeyRef.current = scrollKey;
    pendingSendScrollRef.current = false;
    pendingAnchorScrollRef.current = true;

    requestAnimationFrame(() => {
      syncAnchorScroll(false);
    });

    return true;
  }, [currentId, messages, renderedMessages, syncAnchorMinHeight, syncAnchorScroll]);

  const armSendAnchor = useCallback(() => {
    isNearBottomRef.current = false;
    scrollAnchorTopRef.current = null;
    pendingAnchorScrollRef.current = false;
    pendingSendScrollRef.current = true;
    anchorScrollRetryCountRef.current = 0;
    anchorContentMinHeightRef.current = 0;
    setAnchorContentMinHeight(0);
  }, []);

  useEffect(() => {
    if (!pendingSendScrollRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      void tryResolvePendingSendAnchor();
    });
  }, [messages, renderedMessages, tryResolvePendingSendAnchor]);

  useLayoutEffect(() => {
    if (typeof scrollAnchorTopRef.current !== "number") {
      return;
    }

    if (!syncAnchorMinHeight()) {
      return;
    }

    if (pendingAnchorScrollRef.current) {
      syncAnchorScroll(false);
    }
  }, [anchorContentMinHeight, syncAnchorMinHeight, syncAnchorScroll]);

  const handleComposerSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const height = event.nativeEvent.contentSize.height;
      const lineHeight = 24;
      const paddingVertical = 10 * 2;
      const innerHeight = Math.max(0, height - paddingVertical);
      const lines = Math.max(1, Math.round(innerHeight / lineHeight));
      setComposerVisibleLines(lines);
    },
    []
  );

  const handleInputChange = useCallback((value: string) => {
    inputValueRef.current = value;
    setInput(value);
    if (Platform.OS === "android") {
      setIsKeyboardVisible(true);
      const metrics = Keyboard.metrics();
      setKeyboardInset(
        metrics?.height && metrics.height > 0
          ? keyboardInsetFromScreenY(metrics.height, metrics.screenY)
          : Math.round(Dimensions.get("screen").height * ANDROID_KEYBOARD_FALLBACK_SCREEN_RATIO),
      );
    }
  }, [setInput]);

  const handleMessagesWrapLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    const wasNearBottom = isNearBottomRef.current;
    listViewportHeightRef.current = nextHeight;

    if (pendingSendScrollRef.current) {
      requestAnimationFrame(() => {
        void tryResolvePendingSendAnchor();
      });
      return;
    }

    if (typeof scrollAnchorTopRef.current === "number") {
      requestAnimationFrame(() => {
        syncAnchorMinHeight();
        pendingAnchorScrollRef.current = true;
        syncAnchorScroll(false);
      });
      return;
    }

    if (wasNearBottom || isEffectivelyNearBottom(listContentHeightRef.current, nextHeight)) {
      requestAnimationFrame(() => {
        scrollToLatest(false);
      });
    }
  }, [isEffectivelyNearBottom, scrollToLatest, syncAnchorMinHeight, syncAnchorScroll, tryResolvePendingSendAnchor]);

  const handleMessageListInnerLayout = useCallback((event: LayoutChangeEvent) => {
    const innerHeight = event.nativeEvent.layout.height;
    listContentHeightRef.current = innerHeight + MESSAGE_LIST_PADDING_TOP + MESSAGE_LIST_PADDING_BOTTOM;

    if (pendingSendScrollRef.current) {
      requestAnimationFrame(() => {
        void tryResolvePendingSendAnchor();
      });
      return;
    }

    if (typeof scrollAnchorTopRef.current === "number") {
      requestAnimationFrame(() => {
        pendingAnchorScrollRef.current = true;
        syncAnchorScroll(false);
      });
    }
  }, [syncAnchorScroll, tryResolvePendingSendAnchor]);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    currentScrollOffsetRef.current = contentOffset.y;
    listContentHeightRef.current = contentSize.height;
    listViewportHeightRef.current = layoutMeasurement.height;
    isNearBottomRef.current = isEffectivelyNearBottom(
      contentSize.height,
      layoutMeasurement.height,
      contentOffset.y
    );
    setShowScrollTopButton(contentOffset.y > 40);

    if (isNearBottomRef.current) {
      hideNewestButton();
      return;
    }

    queueNewestButton();
  }, [hideNewestButton, isEffectivelyNearBottom, queueNewestButton]);

  const handleListScrollBeginDrag = useCallback(() => {
    if (
      pendingSendScrollRef.current ||
      pendingAnchorScrollRef.current ||
      typeof scrollAnchorTopRef.current === "number" ||
      anchorContentMinHeightRef.current > 0
    ) {
      clearAnchorState();
    }
  }, [clearAnchorState]);

  const handleListResponderCapture = useCallback(() => {
    if (typeof scrollAnchorTopRef.current === "number" || anchorContentMinHeightRef.current > 0) {
      clearAnchorState();
    }

    return false;
  }, [clearAnchorState]);

  const handleListTouchStart = useCallback(() => {
    if (typeof scrollAnchorTopRef.current === "number" || anchorContentMinHeightRef.current > 0) {
      clearAnchorState();
    }
  }, [clearAnchorState]);

  function scrollToLatest(animated: boolean) {
    hideNewestButton();
    isNearBottomRef.current = true;
    currentScrollOffsetRef.current = Math.max(0, listContentHeightRef.current - listViewportHeightRef.current);
    listRef.current?.scrollToEnd({ animated });
  }

  const dismissKeyboard = useCallback(() => {
    composerInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const syncAndroidKeyboardMetrics = useCallback(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const metrics = Keyboard.metrics();

    if (metrics?.height && metrics.height > 0) {
      setKeyboardInset(keyboardInsetFromScreenY(metrics.height, metrics.screenY));
      return;
    }

    setKeyboardInset(Math.round(Dimensions.get("screen").height * ANDROID_KEYBOARD_FALLBACK_SCREEN_RATIO));
  }, []);

  const handleComposerFocus = useCallback(() => {
    if (Platform.OS !== "android") {
      return;
    }

    setIsKeyboardVisible(true);
    syncAndroidKeyboardMetrics();

    if (keyboardFocusFallbackTimeoutRef.current) {
      clearTimeout(keyboardFocusFallbackTimeoutRef.current);
    }

    keyboardFocusFallbackTimeoutRef.current = setTimeout(() => {
      syncAndroidKeyboardMetrics();
    }, 300);
  }, [syncAndroidKeyboardMetrics]);

  const handleComposerBlur = useCallback(() => {
    if (Platform.OS !== "android") {
      return;
    }

    if (keyboardFocusFallbackTimeoutRef.current) {
      clearTimeout(keyboardFocusFallbackTimeoutRef.current);
      keyboardFocusFallbackTimeoutRef.current = null;
    }

    setIsKeyboardVisible(false);
    setKeyboardInset(0);
  }, []);

  const requestSendWithConsent = useCallback(
    async (text: string) => {
      const nextInput = text.trim();

      if (!nextInput || loading) {
        return;
      }

      let consentAccepted = aiConsentAcceptedState;

      if (!aiConsentLoaded) {
        consentAccepted = await getAiConsentAccepted(user);
        setAiConsentAcceptedState(consentAccepted);
        setAiConsentLoaded(true);
      }

      if (!consentAccepted) {
        dismissKeyboard();
        setShowComposerFullscreen(false);
        setAiConsentPending(nextInput);
        setShowAiConsentModal(true);
        return;
      }

      armSendAnchor();
      void sendMessage(nextInput);
    },
    [
      aiConsentAcceptedState,
      aiConsentLoaded,
      armSendAnchor,
      dismissKeyboard,
      loading,
      sendMessage,
      user,
    ]
  );

  const handleSendPress = useCallback(() => {
    const nextInput = inputValueRef.current.trim();

    if (!nextInput) {
      return;
    }

    void requestSendWithConsent(nextInput);
  }, [requestSendWithConsent]);

  const handleProfilePress = useCallback(() => {
    Keyboard.dismiss();
    setShowChatOptions(false);
    setShowProfileMenu((previous) => !previous);
  }, []);

  const handleContinueAsGuest = useCallback(() => {
    setShowProfileMenu(false);
    void logout();
  }, [logout]);

  const handleDeleteAccountStart = useCallback(() => {
    setShowProfileMenu(false);
    setDeleteAccountError(null);
    setShowDeleteAccountModal(true);
  }, []);

  const handleDeleteAccountCancel = useCallback(() => {
    if (deleteAccountPending) {
      return;
    }

    setDeleteAccountError(null);
    setShowDeleteAccountModal(false);
  }, [deleteAccountPending]);

  const handleDeleteAccountConfirm = useCallback(() => {
    if (deleteAccountPending) {
      return;
    }

    setDeleteAccountPending(true);
    setDeleteAccountError(null);

    void deleteAccount()
      .then(() => {
        setShowDeleteAccountModal(false);
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Unable to delete account right now.";
        setDeleteAccountError(message);
      })
      .finally(() => {
        setDeleteAccountPending(false);
      });
  }, [deleteAccount, deleteAccountPending]);

  const handleAiConsentCancel = useCallback(() => {
    if (aiConsentSaving) {
      return;
    }

    setAiConsentPending(null);
    setShowAiConsentModal(false);
  }, [aiConsentSaving]);

  const handleAiConsentAccept = useCallback(() => {
    if (aiConsentSaving) {
      return;
    }

    setAiConsentSaving(true);

    void setAiConsentAccepted(user, true)
      .then(() => {
        const pendingMessage = aiConsentPending?.trim() || "";

        setAiConsentAcceptedState(true);
        setAiConsentLoaded(true);
        setAiConsentPending(null);
        setShowAiConsentModal(false);

        if (!pendingMessage) {
          return;
        }

        armSendAnchor();
        void sendMessage(pendingMessage);
      })
      .catch((error) => {
        console.error("Failed to persist AI consent", error);
        Alert.alert("Quiet Room", "We couldn't save your consent right now. Please try again.");
      })
      .finally(() => {
        setAiConsentSaving(false);
      });
  }, [aiConsentPending, aiConsentSaving, armSendAnchor, sendMessage, user]);

  const showScrollButtons =
    (showScrollTopButton || showNewestButton) &&
    !chatLoading &&
    !isKeyboardVisible &&
    !showComposerFullscreen;

  const scrollButtonsBottom = 16;
  const composerBottomPadding = useMemo(() => {
    if (Platform.OS === "ios" && keyboardInset > 0) {
      return COMPOSER_ROW_PADDING_BOTTOM + keyboardInset;
    }

    if (Platform.OS === "ios") {
      return COMPOSER_RESTING_BOTTOM_PADDING;
    }

    if (Platform.OS === "android") {
      return isKeyboardVisible
        ? COMPOSER_ROW_PADDING_BOTTOM + ANDROID_KEYBOARD_INPUT_CLEARANCE
        : androidRestingComposerBottomPadding(insets.bottom);
    }

    return COMPOSER_ROW_PADDING_BOTTOM;
  }, [insets.bottom, isKeyboardVisible, keyboardInset]);
  const composerKeyboardOffset = useMemo(() => {
    if (Platform.OS !== "android" || !isKeyboardVisible) {
      return 0;
    }

    // Android keyboard height includes the bottom system inset on both gesture
    // and 3-button nav; subtract it once so the footer does not drift by device.
    return Math.max(0, keyboardInset - insets.bottom);
  }, [insets.bottom, isKeyboardVisible, keyboardInset]);

  if (shouldBlockForConversations) {
    return (
      <SafeAreaView
        edges={Platform.OS === "ios" ? ["top"] : undefined}
        style={styles.safeArea}
        testID={testIds.screen}
      >
        <View style={styles.centeredWrap}>
          <Spinner label="Preparing messages..." size="lg" tone="accent" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={Platform.OS === "ios" ? ["top"] : undefined}
      style={styles.safeArea}
      testID={testIds.screen}
    >
      <StatusBar style="dark" />

      <View style={styles.root}>
        {(showProfileMenu || showChatOptions) ? (
          <Pressable
            onPress={() => {
              setShowProfileMenu(false);
              setShowChatOptions(false);
            }}
            style={styles.inlineMenuBackdrop}
          />
        ) : null}

        <Pressable
          onPress={dismissKeyboard}
          style={[
            styles.header,
            isKeyboardVisible && Platform.OS === "android" ? styles.headerKeyboardActiveAndroid : null,
          ]}
          testID={testIds.header}
        >
          <View pointerEvents="none" style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Quiet Room</Text>
          </View>

          {!isAnon ? (
            <Pressable
              onPress={() => { setShowProfileMenu(false); setShowChatOptions(false); setShowConversations(true); }}
              onPressIn={dismissKeyboard}
              style={styles.headerLeftButton}
              testID={testIds.conversationsButton}
              accessibilityRole="button"
              accessibilityLabel="Toggle conversations"
              hitSlop={8}
            >
              <Feather name="menu" size={18} color={mobileWeb.colors.gray600} />
            </Pressable>
          ) : null}

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => {
                setShowProfileMenu(false);
                setShowChatOptions(false);
                setShowAbout(true);
              }}
              onPressIn={dismissKeyboard}
              style={styles.headerIconButton}
              testID={testIds.aboutButton}
              accessibilityRole="button"
              accessibilityLabel="Open About"
              hitSlop={8}
            >
              <Ionicons name="information-circle-outline" size={22} color={mobileWeb.colors.gray700} />
            </Pressable>
            <Pressable
              onPress={handleProfilePress}
              onPressIn={dismissKeyboard}
              style={styles.headerIconButtonPrimary}
              testID={testIds.profileButton}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              hitSlop={8}
            >
              <View style={styles.headerProfileAvatar}>
                <Ionicons name="person-outline" size={18} color={mobileWeb.colors.blue600} />
              </View>
            </Pressable>

            {showProfileMenu ? (
              <View style={styles.profileMenu} testID={testIds.profileMenu}>
                {isAnon ? (
                  <>
                    <Text style={styles.profileMenuName}>Signed in as Guest</Text>
                    <Text style={styles.profileMenuHint}>Sign in to save and revisit conversations.</Text>
                    <Pressable
                      onPress={() => {
                        setShowProfileMenu(false);
                        setShowLogin(true);
                      }}
                      style={styles.profileMenuButton}
                      testID={testIds.profileSignInButton}
                    >
                      <Text style={styles.profileMenuButtonLabel}>Sign In</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text numberOfLines={1} style={styles.profileMenuName}>
                      {user?.displayName || user?.email || "Signed in"}
                    </Text>
                    <Pressable
                      onPress={handleContinueAsGuest}
                      style={styles.profileMenuButton}
                      testID={testIds.profileLogoutButton}
                    >
                      <Text style={styles.profileMenuButtonLabel}>Logout</Text>
                    </Pressable>
                    <View style={styles.profileMenuDivider} />
                    <Pressable
                      onPress={handleDeleteAccountStart}
                      style={[styles.profileMenuButton, styles.profileMenuDeleteButton]}
                      testID={testIds.profileDeleteButton}
                    >
                      <Text style={[styles.profileMenuButtonLabel, styles.profileMenuDeleteButtonLabel]}>
                        Delete Account
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}
          </View>
          {!isKeyboardVisible ? (
            <View style={styles.crucifixWrap} testID={testIds.crucifixWrapper}>
              <Pressable
                onPress={() => { setShowProfileMenu(false); setShowChatOptions(false); setShowCrucifix(true); }}
                onPressIn={dismissKeyboard}
                style={styles.crucifixButton}
                testID={testIds.crucifixButton}
                accessibilityRole="button"
                accessibilityLabel="Open crucifix image"
              >
                <Image
                  source={require("../../assets/crucifix-web.png")}
                  style={styles.crucifixImage}
                  resizeMode="contain"
                />
              </Pressable>
            </View>
          ) : null}
        </Pressable>
        <View onLayout={handleMessagesWrapLayout} style={styles.messagesWrap}>
          {chatLoading ? (
            <View style={styles.loadingConversation}>
              <Spinner label="Loading conversation..." tone="accent" />
            </View>
          ) : (
            <>
              <ScrollView
                contentContainerStyle={styles.messageListContent}
                style={styles.messageList}
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={(_, contentHeight) => {
                  listContentHeightRef.current = contentHeight;

                  if (pendingSendScrollRef.current) {
                    void tryResolvePendingSendAnchor();
                    return;
                  }

                  if (pendingAnchorScrollRef.current) {
                    syncAnchorScroll(false);
                    return;
                  }

                  if (typeof scrollAnchorTopRef.current === "number") {
                    syncAnchorMinHeight();
                    pendingAnchorScrollRef.current = true;
                    syncAnchorScroll(false);
                    return;
                  }

                  if (isEffectivelyNearBottom(contentHeight, listViewportHeightRef.current)) {
                    scrollToLatest(false);
                  }
                }}
                onScroll={handleListScroll}
                onScrollBeginDrag={handleListScrollBeginDrag}
                onStartShouldSetResponderCapture={handleListResponderCapture}
                onTouchStart={handleListTouchStart}
                ref={listRef}
                testID={testIds.messageList}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                <View
                  collapsable={false}
                  onLayout={handleMessageListInnerLayout}
                  style={[styles.messageListInner, anchorContentMinHeight > 0 ? { minHeight: anchorContentMinHeight } : null]}
                >
                  {renderedMessages.map((item, index) => {
                    const shouldShowSeparator = index < renderedMessages.length - 1;

                    return (
                      <View
                        collapsable={false}
                        key={item.id}
                        style={index === 0 ? styles.openingMessageWrap : null}
                        onLayout={(event: LayoutChangeEvent) => {
                          messageOffsetsRef.current[item.id] = event.nativeEvent.layout.y;

                          if (pendingSendScrollRef.current && item.message.role === "user") {
                            requestAnimationFrame(() => {
                              void tryResolvePendingSendAnchor();
                            });
                          }
                        }}
                      >
                        <MessageBubble
                          autoPlayVoice={item.autoPlayVoice}
                          conversationId={item.conversationId}
                          message={item.message}
                          messageIndex={item.messageIndex ?? undefined}
                          onReportResponse={user ? openReportResponse : undefined}
                          testID={index === 0 ? testIds.openingMessage : messageBubbleTestId(item.message.role, index - 1)}
                          testIndex={index === 0 ? undefined : index - 1}
                        />
                        {shouldShowSeparator ? <View style={styles.messageSeparator} /> : null}
                      </View>
                    );
                  })}
                  <View style={styles.footerWrap}>
                    <View style={[styles.thinkingRow, { opacity: showThinking ? 1 : 0 }]} testID={testIds.thinkingRow}>
                      <Spinner label="Please wait while your response is prepared." tone="accent" size="sm" />
                    </View>
                  </View>
                </View>
              </ScrollView>

              <View pointerEvents="box-none" style={styles.scrollButtonsOverlay}>
                {showScrollButtons ? (
                  <View style={[styles.scrollButtonsStack, { bottom: scrollButtonsBottom }]}>
                    {showScrollTopButton ? (
                      <Pressable
                        onPress={() => {
                          hideNewestButton();
                          listRef.current?.scrollTo({ animated: true, x: 0, y: 0 });
                        }}
                        style={({ pressed }) => [
                          styles.scrollActionButton,
                          pressed && styles.scrollActionButtonPressed,
                        ]}
                        testID={testIds.scrollTopButton}
                      >
                        <Text style={styles.scrollActionLabel}>Top</Text>
                      </Pressable>
                    ) : (
                      <View pointerEvents="none" style={styles.scrollActionPlaceholder} />
                    )}

                    {showNewestButton ? (
                      <Pressable
                        onPress={() => {
                          scrollToLatest(true);
                        }}
                        style={({ pressed }) => [
                          styles.scrollActionButton,
                          pressed && styles.scrollActionButtonPressed,
                        ]}
                        testID={testIds.scrollNewestButton}
                      >
                        <Text style={styles.scrollActionLabel}>Newest</Text>
                      </Pressable>
                    ) : (
                      <View pointerEvents="none" style={styles.scrollActionPlaceholder} />
                    )}
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>

        {showPromptCues ? (
          <View style={styles.promptDock}>
            <View style={styles.promptCard}>
              <PromptCues
                disabled={loading}
                isAnon={isAnon}
                onSelectPrompt={(prompt) => {
                  dismissKeyboard();
                  inputValueRef.current = prompt;
                  setInput(prompt);
                  void requestSendWithConsent(prompt);
                }}
              />
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.inputRow,
            {
              marginBottom: composerKeyboardOffset,
              paddingBottom: composerBottomPadding,
            },
          ]}
        >
            {showChatOptionsButton ? (
              <View
                style={[styles.modelColumn, showChatOptions && styles.modelColumnMenuOpen]}
                testID={testIds.modelPickerContainer}
              >
                <Text style={styles.modelCaption} testID={testIds.modelSelectedLabel}>
                  {composerModelLabel}
                </Text>
                <Pressable
                  disabled={loading}
                  onPress={() => {
                    setShowProfileMenu(false);
                    setShowChatOptions((previous) => !previous);
                  }}
                  style={({ pressed }) => [
                    styles.modelButton,
                    pressed && !loading && styles.modelButtonPressed,
                  ]}
                  testID={testIds.modelMenuButton}
                >
                  <Ionicons
                    name="add"
                    size={22}
                    color={mobileWeb.colors.gray600}
                    style={styles.modelButtonIcon}
                  />
                </Pressable>

                {showChatOptions ? (
                  <View style={styles.modelMenu} testID={testIds.modelMenu}>
                    {voiceModeAvailable ? (
                      <>
                        <Pressable
                          onPress={() => {
                            setVoiceModeEnabled((previous) => !previous);
                          }}
                          style={styles.modelMenuVoiceRow}
                          testID={testIds.modelMenuVoiceToggle}
                        >
                          <View style={styles.modelMenuVoiceCopy}>
                            <Text style={styles.modelMenuVoiceTitle}>Voice mode</Text>
                            <Text style={styles.modelMenuVoiceSubtitle}>Auto-play replies</Text>
                          </View>
                          <View
                            style={[
                              styles.modelMenuSwitchTrack,
                              voiceModeEnabled && styles.modelMenuSwitchTrackOn,
                            ]}
                          >
                            <View
                              style={[
                                styles.modelMenuSwitchThumb,
                                voiceModeEnabled && styles.modelMenuSwitchThumbOn,
                              ]}
                            />
                          </View>
                        </Pressable>
                        {showModelSection ? <View style={styles.modelMenuDivider} /> : null}
                      </>
                    ) : null}

                    {showModelSection ? (
                      <>
                        <Text style={styles.modelMenuSectionLabel}>MODEL</Text>

                        {modelOptions.map((option) => {
                          const active = option.key === currentModel;

                          return (
                            <Pressable
                              key={option.key}
                              onPress={() => {
                                setCurrentModel(option.key);
                                setShowChatOptions(false);
                              }}
                              style={[
                                styles.modelMenuOption,
                                active && styles.modelMenuOptionActive,
                              ]}
                              testID={modelOptionTestId(option.key)}
                            >
                              <Text
                                style={[
                                  styles.modelMenuOptionLabel,
                                  active && styles.modelMenuOptionLabelActive,
                                ]}
                              >
                                {option.shortLabel || option.label}
                              </Text>
                              {active ? <Text style={styles.modelMenuOptionBadge}>Active</Text> : null}
                            </Pressable>
                          );
                        })}
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.composerWrap} testID={testIds.composerWrapper}>
              <View style={styles.composerMetaRow}>
                {voiceModeAvailable ? (
                  <View style={styles.voiceModeBadgeSlot}>
                    {voiceModeEnabled ? (
                      <Pressable
                        accessibilityLabel="Turn off voice mode"
                        hitSlop={6}
                        onPress={() => setVoiceModeEnabled(false)}
                        style={({ pressed }) => [
                          styles.voiceModeBadge,
                          pressed && styles.voiceModeBadgePressed,
                        ]}
                        testID={testIds.voiceModeIndicator}
                      >
                        <Text style={styles.voiceModeBadgeLabel}>Voice</Text>
                        <View style={styles.voiceModeBadgeClose}>
                          <Text aria-hidden style={styles.voiceModeBadgeCloseLabel}>X</Text>
                        </View>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.composerMetaSpacer} />
                )}

                {!showComposerFullscreen && composerVisibleLines > 3 ? (
                  <Pressable
                    accessibilityLabel="Open fullscreen composer"
                    disabled={loading}
                    onPress={() => setShowComposerFullscreen(true)}
                    style={({ pressed }) => [
                      styles.composerFullscreenTrigger,
                      pressed && !loading && styles.composerFullscreenTriggerPressed,
                      loading && styles.composerFullscreenTriggerDisabled,
                    ]}
                    testID={testIds.composerExpand}
                  >
                    <Ionicons name="expand-outline" size={18} color={mobileWeb.colors.gray700} />
                  </Pressable>
                ) : (
                  <View pointerEvents="none" style={styles.composerFullscreenTriggerPlaceholder} />
                )}
              </View>

              <TextInput
                editable={!loading}
                multiline
                onChangeText={handleInputChange}
                onContentSizeChange={handleComposerSizeChange}
                onBlur={handleComposerBlur}
                onFocus={handleComposerFocus}
                onPressIn={handleComposerFocus}
                placeholder="Share what is present..."
                placeholderTextColor={mobileWeb.colors.gray500}
                selectionColor={mobileWeb.colors.blue600}
                ref={composerInputRef}
                style={styles.composerInput}
                testID={testIds.composerInput}
                value={input}
              />
            </View>

            <Pressable
              disabled={loading}
              onPress={handleSendPress}
              style={({ pressed }) => [
                styles.sendButton,
                (loading || !input.trim()) && styles.sendButtonDisabled,
                pressed && !(loading || !input.trim()) && styles.sendButtonPressed,
              ]}
              testID={testIds.sendButton}
            >
              <Text style={styles.sendButtonLabel}>{loading ? "..." : "Send"}</Text>
            </Pressable>
          </View>
<Modal
          animationType="slide"
          transparent={false}
          visible={showComposerFullscreen}
          onRequestClose={() => setShowComposerFullscreen(false)}
        >
          <SafeAreaView
            edges={["left", "right"]}
            style={[
              styles.fullscreenSafeArea,
              { paddingBottom: insets.bottom, paddingTop: insets.top },
            ]}
          >
            <View style={styles.fullscreenHeader}>
              <Text style={styles.fullscreenHeaderTitle}>Compose</Text>
              <Pressable onPress={() => setShowComposerFullscreen(false)} style={styles.fullscreenHeaderButton} testID={testIds.composerFullscreenClose}>
                <Text style={styles.fullscreenHeaderButtonText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.fullscreenBody}>
              <TextInput
                editable={!loading}
                multiline
                onChangeText={handleInputChange}
                placeholder="Share what is present..."
                placeholderTextColor={mobileWeb.colors.gray500}
                selectionColor={mobileWeb.colors.blue600}
                style={styles.fullscreenInput}
                testID={testIds.composerFullscreenInput}
                value={input}
              />
            </View>

            <View style={styles.fullscreenFooter}>
              <Pressable onPress={() => setShowComposerFullscreen(false)} style={styles.fullscreenFooterButton}>
                <Text style={styles.fullscreenFooterButtonText}>Collapse</Text>
              </Pressable>
              <Pressable
                disabled={loading}
                onPress={() => {
                  setShowComposerFullscreen(false);
                  handleSendPress();
                }}
                style={({ pressed }) => [
                  styles.fullscreenSend,
                  (loading || !input.trim()) && styles.sendButtonDisabled,
                  pressed && !(loading || !input.trim()) && styles.sendButtonPressed,
                ]}
                testID={testIds.fullscreenSendButton}
              >
                <Text style={styles.sendButtonLabel}>Send</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={showAiConsentModal}
          onRequestClose={handleAiConsentCancel}
        >
          <View style={styles.aiConsentBackdrop}>
            <Pressable
              onPress={handleAiConsentCancel}
              style={StyleSheet.absoluteFill}
              disabled={aiConsentSaving}
            />
            <SafeAreaView style={styles.aiConsentSafeArea}>
              <View style={styles.aiConsentCard} testID={testIds.aiConsentModal}>
                <Text style={styles.aiConsentTitle}>Before you continue</Text>
                <Text style={styles.aiConsentBody}>
                  Quiet Room sends the message you type to our AI service so it can generate a
                  response. Continue only if you consent to sharing that message for this purpose.
                </Text>
                <View style={styles.aiConsentActions}>
                  <Pressable
                    onPress={handleAiConsentCancel}
                    style={({ pressed }) => [
                      styles.aiConsentSecondaryButton,
                      pressed && !aiConsentSaving && styles.aiConsentSecondaryButtonPressed,
                    ]}
                    disabled={aiConsentSaving}
                    testID={testIds.aiConsentCancelButton}
                  >
                    <Text style={styles.aiConsentSecondaryButtonLabel}>Not now</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleAiConsentAccept}
                    style={({ pressed }) => [
                      styles.aiConsentPrimaryButton,
                      aiConsentSaving && styles.aiConsentPrimaryButtonDisabled,
                      pressed && !aiConsentSaving && styles.aiConsentPrimaryButtonPressed,
                    ]}
                    disabled={aiConsentSaving}
                    testID={testIds.aiConsentAcceptButton}
                  >
                    <Text style={styles.aiConsentPrimaryButtonLabel}>
                      {aiConsentSaving ? "Saving..." : "I Consent"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </SafeAreaView>
          </View>
        </Modal>


        <Modal
          animationType="fade"
          transparent
          visible={showDeleteAccountModal}
          onRequestClose={handleDeleteAccountCancel}
        >
          <View style={styles.deleteAccountBackdrop}>
            <Pressable
              onPress={handleDeleteAccountCancel}
              style={StyleSheet.absoluteFill}
              disabled={deleteAccountPending}
            />
            <SafeAreaView style={styles.deleteAccountSafeArea}>
              <View style={styles.deleteAccountCard} testID={testIds.deleteAccountModal}>
                <Text style={styles.deleteAccountTitle}>Delete Account?</Text>
                <Text style={styles.deleteAccountBody}>
                  This permanently deletes your account and associated Quiet Room data. This
                  action cannot be undone.
                </Text>
                {deleteAccountError ? (
                  <Text style={styles.deleteAccountError} testID={testIds.deleteAccountError}>
                    {deleteAccountError}
                  </Text>
                ) : null}
                <View style={styles.deleteAccountActions}>
                  <Pressable
                    onPress={handleDeleteAccountCancel}
                    style={({ pressed }) => [
                      styles.deleteAccountSecondaryButton,
                      pressed && !deleteAccountPending && styles.deleteAccountSecondaryButtonPressed,
                    ]}
                    disabled={deleteAccountPending}
                    testID={testIds.deleteAccountCancelButton}
                  >
                    <Text style={styles.deleteAccountSecondaryButtonLabel}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteAccountConfirm}
                    style={({ pressed }) => [
                      styles.deleteAccountPrimaryButton,
                      deleteAccountPending && styles.deleteAccountPrimaryButtonDisabled,
                      pressed &&
                        !deleteAccountPending &&
                        styles.deleteAccountPrimaryButtonPressed,
                    ]}
                    disabled={deleteAccountPending}
                    testID={testIds.deleteAccountConfirmButton}
                  >
                    <Text style={styles.deleteAccountPrimaryButtonLabel}>
                      {deleteAccountPending ? "Deleting..." : "Delete Account"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </SafeAreaView>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent={false}
          visible={showCrucifix}
          onRequestClose={() => setShowCrucifix(false)}
        >
          <SafeAreaView
            edges={["left", "right"]}
            style={[
              styles.crucifixModalScreen,
              { paddingBottom: insets.bottom, paddingTop: insets.top },
            ]}
            testID={testIds.crucifixModal}
          >
            <View style={styles.crucifixModalHeader}>
              <Pressable
                accessibilityLabel="Close crucifix"
                hitSlop={10}
                onPress={() => setShowCrucifix(false)}
                style={({ pressed }) => [
                  styles.crucifixModalCloseButton,
                  pressed && styles.crucifixModalCloseButtonPressed,
                ]}
                testID={testIds.crucifixClose}
              >
                <Ionicons name="close" size={28} color={mobileWeb.colors.gray700} />
              </Pressable>
            </View>

            <View style={styles.crucifixModalImageWrap}>
              <Image
                source={require("../../assets/crucifix-web.png")}
                style={styles.crucifixModalImage}
                resizeMode="contain"
                testID={testIds.crucifixImage}
              />
            </View>
          </SafeAreaView>
        </Modal>

        <ReportResponseModal
          error={reportResponseError}
          onClose={closeReportResponse}
          onSubmit={submitReportResponse}
          pending={reportResponsePending}
          submitted={reportResponseSubmitted}
          visible={Boolean(reportResponseTarget)}
        />

        <LoginModal onClose={() => setShowLogin(false)} visible={showLogin} />

        <AboutModal isAnon={isAnon} onClose={() => setShowAbout(false)} visible={showAbout} />

        <ConversationsModal
          conversations={conversationList}
          currentId={currentId}
          hasMoreConversations={hasMoreConversations}
          loading={sidebarLoading}
          loadingMore={loadingMoreConversations}
          onClose={() => setShowConversations(false)}
          onLoadMore={loadMoreConversations}
          onCreateNew={() => {
            createNewChat();
            setShowConversations(false);
          }}
          onDeleteConversation={deleteConversation}
          onRenameConversation={renameConversation}
          onSelectConversation={(conversationId) => {
            setCurrentId(conversationId);
            setShowConversations(false);
          }}
          visible={!isAnon && showConversations}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centeredWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  composerInput: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray300,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    color: mobileWeb.colors.gray900,
    fontSize: 15,
    lineHeight: 24,
    maxHeight: 192,
    minHeight: 40,
    paddingBottom: 10,
    paddingHorizontal: 12,
    paddingRight: 12,
    paddingTop: 10,
  },
  composerWrap: {
    flex: 1,
    gap: COMPOSER_META_ROW_GAP,
    position: "relative",
  },
  composerMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: COMPOSER_META_ROW_HEIGHT,
  },
  composerMetaSpacer: {
    flex: 1,
    minHeight: COMPOSER_META_ROW_HEIGHT,
  },
  composerFullscreenTrigger: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 10,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    width: 32,
  },
  composerFullscreenTriggerDisabled: {
    opacity: 0.45,
  },
  composerFullscreenTriggerPlaceholder: {
    height: 32,
    opacity: 0,
    width: 32,
  },
  composerFullscreenTriggerPressed: {
    backgroundColor: mobileWeb.colors.surface,
  },
  crucifixButton: {
    borderRadius: mobileWeb.radii.lg,
    height: 128,
    overflow: "hidden",
    width: 96,
  },
  crucifixImage: {
    height: 128,
    width: 96,
  },
  crucifixModalCloseButton: {
    alignItems: "center",
    backgroundColor: "rgba(28, 25, 23, 0.08)",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  crucifixModalCloseButtonPressed: {
    backgroundColor: "rgba(28, 25, 23, 0.14)",
  },
  crucifixModalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 12 : 28,
  },
  crucifixModalImage: {
    height: "100%",
    width: "100%",
  },
  crucifixModalImageWrap: {
    flex: 1,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  crucifixModalScreen: {
    backgroundColor: mobileWeb.colors.white,
    flex: 1,
  },
  crucifixWrap: {
    alignItems: "center",
    height: 128,
    justifyContent: "center",
    marginTop: crucifixTopMargin(),
  },
  footerWrap: {
    minHeight: 18,
    paddingTop: 12,
  },
  fullscreenBody: {
    flex: 1,
    padding: 16,
  },
  fullscreenFooter: {
    alignItems: "center",
    borderColor: mobileWeb.colors.gray200,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    padding: 16,
  },
  fullscreenFooterButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fullscreenFooterButtonText: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  fullscreenHeader: {
    alignItems: "center",
    borderColor: mobileWeb.colors.gray200,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  fullscreenHeaderButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fullscreenHeaderButtonText: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  fullscreenHeaderTitle: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "700",
  },
  fullscreenInput: {
    borderColor: mobileWeb.colors.gray300,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    color: mobileWeb.colors.gray900,
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  fullscreenSafeArea: {
    backgroundColor: mobileWeb.colors.bg,
    flex: 1,
  },
  fullscreenSend: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 14,
  },
  header: {
    backgroundColor: mobileWeb.colors.surface,
    borderBottomColor: mobileWeb.colors.gray200,
    borderBottomWidth: 1,
    overflow: "visible",
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: headerTopPadding(),
    position: "relative",
    zIndex: 25,
  },
  headerKeyboardActiveAndroid: {
    minHeight: 48,
  },
  headerIconButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headerIconButtonPrimary: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray300,
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    width: 40,
  },
  headerProfileAvatar: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  headerGlyph: {
    color: mobileWeb.colors.gray600,
    fontSize: 18,
    fontWeight: "600",
  },
  headerIconButtonText: {
    color: mobileWeb.colors.gray600,
    fontSize: 13,
    fontWeight: "600",
  },
  headerLeftButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    left: 16,
    position: "absolute",
    top: headerControlsTop(),
    width: 40,
  },
  headerLeftButtonText: {
    color: mobileWeb.colors.gray700,
    fontSize: 13,
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    gap: 8,
    overflow: "visible",
    position: "absolute",
    right: 16,
    top: headerControlsTop(),
    zIndex: 40,
  },
  headerTitleWrap: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: headerTitleTop(),
  },
  headerTitle: {
    color: mobileWeb.colors.gray700,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2.8,
    textAlign: "center",
    textTransform: "uppercase",
  },
  inputRow: {
    alignItems: "flex-end",
    backgroundColor: mobileWeb.colors.surface,
    borderColor: mobileWeb.colors.gray200,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingBottom: COMPOSER_ROW_PADDING_BOTTOM,
    paddingHorizontal: 16,
    paddingTop: COMPOSER_ROW_PADDING_TOP,
    position: "relative",
    zIndex: 25,
  },
  loadingConversation: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
    padding: 16,
  },
  messageList: {
    marginTop: 0,
  },
  messageListContent: {
    paddingBottom: MESSAGE_LIST_PADDING_BOTTOM,
    paddingHorizontal: 16,
    paddingTop: MESSAGE_LIST_PADDING_TOP,
  },
  messageSeparator: {
    height: 16,
  },
  openingMessageWrap: {
    marginTop: OPENING_MESSAGE_TOP_OFFSET,
  },
  messageListInner: {
    minWidth: "100%",
  },
  messagesWrap: {
    backgroundColor: "transparent",
    flex: 1,
    position: "relative",
  },
  modelButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  modelButtonPressed: {
    backgroundColor: "rgba(120, 113, 108, 0.12)",
  },
  modelButtonIcon: {
    marginTop: -1,
  },
  modelButtonText: {
    color: mobileWeb.colors.gray600,
    fontSize: 20,
    fontWeight: "600",
    marginTop: -2,
  },
  modelCaption: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  modelColumn: {
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-end",
    position: "relative",
    width: 72,
  },
  modelColumnMenuOpen: {
    elevation: 20,
    zIndex: 80,
  },
  voiceModeBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 24,
    paddingLeft: 12,
    paddingRight: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  voiceModeBadgeSlot: {
    justifyContent: "center",
    minHeight: COMPOSER_META_ROW_HEIGHT,
  },
  voiceModeBadgeClose: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  voiceModeBadgeCloseLabel: {
    color: mobileWeb.colors.blue600,
    fontSize: 11,
    fontWeight: "700",
  },
  voiceModeBadgeLabel: {
    color: mobileWeb.colors.blue600,
    fontSize: 12,
    fontWeight: "600",
  },
  voiceModeBadgePressed: {
    backgroundColor: mobileWeb.colors.blue200,
  },
  inlineMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 15,
  },
  modelMenu: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    bottom: 56,
    elevation: 20,
    left: 0,
    paddingBottom: 8,
    paddingTop: 0,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    width: 272,
    zIndex: 45,
  },
  modelMenuDivider: {
    backgroundColor: mobileWeb.colors.border,
    height: 1,
    marginVertical: 8,
  },
  modelMenuOption: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modelMenuOptionActive: {
    backgroundColor: mobileWeb.colors.blue50,
  },
  modelMenuOptionBadge: {
    color: mobileWeb.colors.blue600,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  modelMenuOptionLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  modelMenuOptionLabelActive: {
    color: mobileWeb.colors.blue600,
    fontWeight: "700",
  },
  modelMenuSectionLabel: {
    color: mobileWeb.colors.gray500,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    paddingBottom: 6,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  modelMenuSwitchThumb: {
    backgroundColor: mobileWeb.colors.white,
    borderRadius: 999,
    height: 16,
    transform: [{ translateX: 4 }],
    width: 16,
  },
  modelMenuSwitchThumbOn: {
    transform: [{ translateX: 20 }],
  },
  modelMenuSwitchTrack: {
    backgroundColor: mobileWeb.colors.gray300,
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: 40,
  },
  modelMenuSwitchTrackOn: {
    backgroundColor: mobileWeb.colors.blue600,
  },
  modelMenuVoiceCopy: {
    flex: 1,
  },
  modelMenuVoiceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modelMenuVoiceSubtitle: {
    color: mobileWeb.colors.gray500,
    fontSize: 12,
  },
  modelMenuVoiceTitle: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  profileMenu: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    minWidth: 228,
    padding: 12,
    position: "absolute",
    right: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    top: 46,
    zIndex: 50,
  },
  profileMenuButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileMenuDeleteButton: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  profileMenuDeleteButtonLabel: {
    color: "#B91C1C",
  },
  profileMenuDivider: {
    backgroundColor: mobileWeb.colors.gray200,
    height: 1,
    marginTop: 12,
  },
  profileMenuButtonLabel: {
    color: mobileWeb.colors.blue600,
    fontSize: 13,
    fontWeight: "600",
  },
  aiConsentActions: {
    columnGap: 10,
    flexDirection: "row",
    marginTop: 20,
  },
  aiConsentBackdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    flex: 1,
  },
  aiConsentBody: {
    color: mobileWeb.colors.gray600,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  aiConsentCard: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  aiConsentPrimaryButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  aiConsentPrimaryButtonDisabled: {
    opacity: 0.65,
  },
  aiConsentPrimaryButtonLabel: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  aiConsentPrimaryButtonPressed: {
    opacity: 0.88,
  },
  aiConsentSafeArea: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  aiConsentSecondaryButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  aiConsentSecondaryButtonLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  aiConsentSecondaryButtonPressed: {
    backgroundColor: mobileWeb.colors.yellow50,
  },
  aiConsentTitle: {
    color: mobileWeb.colors.gray700,
    fontSize: 20,
    fontWeight: "700",
  },
  deleteAccountActions: {
    columnGap: 10,
    flexDirection: "row",
    marginTop: 20,
  },
  deleteAccountBackdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    flex: 1,
  },
  deleteAccountBody: {
    color: mobileWeb.colors.gray600,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  deleteAccountCard: {
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  deleteAccountError: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 12,
  },
  deleteAccountPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#DC2626",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  deleteAccountPrimaryButtonDisabled: {
    opacity: 0.65,
  },
  deleteAccountPrimaryButtonLabel: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  deleteAccountPrimaryButtonPressed: {
    opacity: 0.88,
  },
  deleteAccountSafeArea: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  deleteAccountSecondaryButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  deleteAccountSecondaryButtonLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 14,
    fontWeight: "600",
  },
  deleteAccountSecondaryButtonPressed: {
    backgroundColor: mobileWeb.colors.yellow50,
  },
  deleteAccountTitle: {
    color: mobileWeb.colors.gray700,
    fontSize: 20,
    fontWeight: "700",
  },
  profileMenuHint: {
    color: mobileWeb.colors.gray500,
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  profileMenuName: {
    color: mobileWeb.colors.gray700,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  promptDock: {
    backgroundColor: mobileWeb.colors.bg,
    paddingBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  promptCard: {
    backgroundColor: mobileWeb.colors.surfaceStrong,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  root: {
    backgroundColor: mobileWeb.colors.bg,
    flex: 1,
    position: "relative",
  },
  safeArea: {
    backgroundColor: mobileWeb.colors.white,
    flex: 1,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.blue600,
    borderRadius: mobileWeb.radii.xl,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(183, 146, 47, 0.45)",
  },
  sendButtonLabel: {
    color: mobileWeb.colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  scrollActionButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 74,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  scrollActionButtonPressed: {
    backgroundColor: mobileWeb.colors.surface,
  },
  scrollActionPlaceholder: {
    minHeight: 36,
    minWidth: 74,
    opacity: 0,
    paddingHorizontal: 12,
  },
  scrollActionLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 12,
    fontWeight: "600",
  },
  scrollButtonsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  scrollButtonsStack: {
    alignItems: "flex-end",
    flexDirection: "column",
    gap: 8,
    position: "absolute",
    right: 16,
  },
  thinkingRow: {
    flexDirection: "row",
    paddingTop: 2,
  },
});
