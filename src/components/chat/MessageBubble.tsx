import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Check, Copy, User } from "lucide-react";

import type { Message } from "@/types";
import { cn } from "@/lib/utils";

function MessageContent({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
}: {
  message: Message;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={cn(
        "group flex w-full gap-3 px-4 py-4 md:px-6",
        isUser ? "bg-transparent" : "bg-muted/30"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-medium">
            {isUser ? "You" : "Assistant"}
          </span>
          {!isUser && message.content && (
            <button
              onClick={copy}
              className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
              title="Copy"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
        {message.content ? (
          <MessageContent content={message.content} />
        ) : streaming ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              thinking…
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {streaming && message.content && (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground align-text-bottom" />
        )}
      </div>
    </div>
  );
});
