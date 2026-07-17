import { useCallback, useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { splitTextForSearchHighlight } from "../lib/conversationSearchNavigation";
import type { ChatMessage } from "../types/chat";
import { mobileWeb } from "../theme/mobileWeb";
import {
  messageCopyButtonTestId,
  messageReportButtonTestId,
  messageVoiceButtonTestId,
} from "../testIds";
import MessageVoiceButton from "./MessageVoiceButton";

const COPY_RESET_MS = 1500;

type CopyState = "copied" | "error" | "idle";

type TextSegment = {
  bold: boolean;
  italic: boolean;
  text: string;
};

type MessageBubbleProps = {
  autoPlayVoice?: boolean;
  conversationId?: string | null;
  highlightQuery?: string;
  highlightTestID?: string;
  messageIndex?: number;
  message: ChatMessage;
  onReportResponse?: (target: {
    conversationId: string;
    message: ChatMessage;
    messageIndex: number;
  }) => void;
  searchMatchActive?: boolean;
  searchMatchLabel?: string;
  testID?: string;
  testIndex?: number;
};

function parseInlineMarkdown(content: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/gs;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > cursor) {
      segments.push({
        bold: false,
        italic: false,
        text: content.slice(cursor, match.index),
      });
    }

    segments.push({
      bold: Boolean(match[2]),
      italic: Boolean(match[3]),
      text: match[2] || match[3],
    });

    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) {
    segments.push({
      bold: false,
      italic: false,
      text: content.slice(cursor),
    });
  }

  return segments.length > 0 ? segments : [{ bold: false, italic: false, text: content }];
}

export default function MessageBubble({
  autoPlayVoice = false,
  conversationId,
  highlightQuery,
  highlightTestID,
  messageIndex,
  message,
  onReportResponse,
  searchMatchActive = false,
  searchMatchLabel,
  testID,
  testIndex,
}: MessageBubbleProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUser = message.role === "user";
  const content = typeof message.content === "string" ? message.content : "";
  const contentSegments = parseInlineMarkdown(content);
  const showSearchHighlight = searchMatchActive && Boolean(highlightQuery?.trim());

  const showCopyButton =
    !isUser && content.trim().length > 0 && !message.isStreaming && !message.audioSrc;

  const showVoiceButton =
    !isUser &&
    !message.disableVoice &&
    !message.isStreaming &&
    (Boolean(message.audioSrc) || Boolean(content.trim()));

  const showReportButton =
    !isUser &&
    !message.isStreaming &&
    content.trim().length > 0 &&
    typeof conversationId === "string" &&
    conversationId.trim().length > 0 &&
    typeof messageIndex === "number" &&
    messageIndex >= 0 &&
    typeof onReportResponse === "function";

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!content.trim()) {
      return;
    }

    try {
      await Clipboard.setStringAsync(content);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }

    copyTimerRef.current = setTimeout(() => {
      setCopyState("idle");
      copyTimerRef.current = null;
    }, COPY_RESET_MS);
  }, [content]);

  const voiceButtonTestID =
    typeof testIndex === "number" ? messageVoiceButtonTestId(message.role, testIndex) : undefined;
  const copyButtonTestID =
    !isUser && typeof testIndex === "number" ? messageCopyButtonTestId(testIndex) : undefined;
  const reportButtonTestID =
    !isUser && typeof testIndex === "number" ? messageReportButtonTestId(testIndex) : undefined;

  return (
    <View
      accessibilityLabel={showSearchHighlight ? searchMatchLabel : undefined}
      testID={testID}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          showSearchHighlight && styles.searchMatchBubble,
        ]}
      >
        <Text
          selectable={content.trim().length > 0}
          selectionColor={mobileWeb.colors.blue200}
          style={styles.content}
          testID={highlightTestID}
        >
          {contentSegments.map((segment, index) => (
            <Text
              key={`${segment.bold ? "bold" : segment.italic ? "italic" : "plain"}-${index}`}
              style={[
                segment.bold ? styles.contentBold : null,
                segment.italic ? styles.contentItalic : null,
              ]}
            >
              {(showSearchHighlight
                ? splitTextForSearchHighlight(segment.text, highlightQuery)
                : [{ highlighted: false, text: segment.text }]
              ).map((part, partIndex) => (
                <Text
                  key={`${index}-${partIndex}-${part.highlighted ? "match" : "text"}`}
                  style={part.highlighted ? styles.searchHighlight : null}
                >
                  {part.text}
                </Text>
              ))}
            </Text>
          ))}
        </Text>

        {showCopyButton || showVoiceButton || showReportButton ? (
          <View style={styles.actionsRow}>
            {showCopyButton ? (
              <Pressable
                accessibilityLabel={
                  copyState === "copied"
                    ? "Copied assistant message"
                    : copyState === "error"
                      ? "Copy failed"
                      : "Copy assistant message"
                }
                onPress={() => {
                  void handleCopy();
                }}
                testID={copyButtonTestID}
                style={({ pressed }) => [
                  styles.actionButton,
                  copyState === "copied" && styles.actionButtonActive,
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Ionicons
                  color={
                    copyState === "copied"
                      ? mobileWeb.colors.blue600
                      : copyState === "error"
                        ? mobileWeb.colors.red600
                        : mobileWeb.colors.gray700
                  }
                  name={
                    copyState === "copied"
                      ? "checkmark"
                      : copyState === "error"
                        ? "alert-circle-outline"
                        : "copy-outline"
                  }
                  size={16}
                />
              </Pressable>
            ) : null}

            {showVoiceButton ? (
              <MessageVoiceButton
                audioSrc={message.audioSrc}
                autoPlay={autoPlayVoice}
                conversationId={conversationId}
                messageIndex={messageIndex}
                testID={voiceButtonTestID}
                text={content}
              />
            ) : null}

            {showReportButton ? (
              <Pressable
                accessibilityLabel="Report response"
                onPress={() => {
                  onReportResponse?.({
                    conversationId: conversationId.trim(),
                    message,
                    messageIndex,
                  });
                }}
                testID={reportButtonTestID}
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Ionicons color={mobileWeb.colors.gray700} name="flag-outline" size={16} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: mobileWeb.colors.white,
    borderColor: mobileWeb.colors.gray200,
    borderRadius: 6,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  actionButtonActive: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
  },
  actionButtonLabel: {
    color: mobileWeb.colors.gray700,
    fontSize: 11,
    fontWeight: "600",
  },
  actionButtonLabelActive: {
    color: "#1E40AF",
  },
  actionButtonPressed: {
    opacity: 0.86,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  assistantBubble: {
    backgroundColor: mobileWeb.colors.yellow50,
    borderColor: mobileWeb.colors.yellow200,
  },
  bubble: {
    borderRadius: mobileWeb.radii.lg,
    borderWidth: 1,
    maxWidth: 512,
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    color: mobileWeb.colors.gray900,
    fontSize: mobileWeb.typography.body.fontSize,
    lineHeight: mobileWeb.typography.body.lineHeight,
  },
  contentBold: {
    fontWeight: "700",
  },
  contentItalic: {
    fontStyle: "italic",
  },
  row: {
    width: "100%",
  },
  rowAssistant: {
    alignItems: "flex-start",
  },
  rowUser: {
    alignItems: "flex-end",
  },
  searchHighlight: {
    backgroundColor: mobileWeb.colors.blue200,
    color: mobileWeb.colors.gray900,
    fontWeight: "800",
  },
  searchMatchBubble: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue600,
    borderWidth: 2,
  },
  userBubble: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
  },
});
