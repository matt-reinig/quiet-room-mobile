import { useCallback, useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatMessage } from "../types/chat";
import { mobileWeb } from "../theme/mobileWeb";
import {
  messageCopyButtonTestId,
  messageVoiceButtonTestId,
} from "../testIds";
import MessageVoiceButton from "./MessageVoiceButton";

const COPY_RESET_MS = 1500;

type CopyState = "copied" | "error" | "idle";

type TextSegment = {
  bold: boolean;
  text: string;
};

type MessageBubbleProps = {
  autoPlayVoice?: boolean;
  conversationId?: string | null;
  message: ChatMessage;
  testID?: string;
  testIndex?: number;
};

function parseInlineMarkdown(content: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = /\*\*(.+?)\*\*/gs;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > cursor) {
      segments.push({
        bold: false,
        text: content.slice(cursor, match.index),
      });
    }

    segments.push({
      bold: true,
      text: match[1],
    });

    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) {
    segments.push({
      bold: false,
      text: content.slice(cursor),
    });
  }

  return segments.length > 0 ? segments : [{ bold: false, text: content }];
}

export default function MessageBubble({
  autoPlayVoice = false,
  conversationId,
  message,
  testID,
  testIndex,
}: MessageBubbleProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUser = message.role === "user";
  const content = typeof message.content === "string" ? message.content : "";
  const contentSegments = parseInlineMarkdown(content);

  const showCopyButton =
    !isUser && content.trim().length > 0 && !message.isStreaming && !message.audioSrc;

  const showVoiceButton =
    !isUser &&
    !message.disableVoice &&
    !message.isStreaming &&
    (Boolean(message.audioSrc) || Boolean(content.trim()));

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

  return (
    <View testID={testID} style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.content}>
          {contentSegments.map((segment, index) => (
            <Text
              key={`${segment.bold ? "bold" : "plain"}-${index}`}
              style={segment.bold ? styles.contentBold : null}
            >
              {segment.text}
            </Text>
          ))}
        </Text>

        {showCopyButton || showVoiceButton ? (
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
                messageIndex={testIndex}
                testID={voiceButtonTestID}
                text={content}
              />
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
  row: {
    width: "100%",
  },
  rowAssistant: {
    alignItems: "flex-start",
  },
  rowUser: {
    alignItems: "flex-end",
  },
  userBubble: {
    backgroundColor: mobileWeb.colors.blue50,
    borderColor: mobileWeb.colors.blue200,
  },
});

