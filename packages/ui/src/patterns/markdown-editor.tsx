"use client";

import "@uiw/react-md-editor/markdown-editor.css";

import { commands, type MDEditorProps } from "@uiw/react-md-editor";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { cn } from "../lib/cn";

import { Markdown } from "./markdown";

/** The editor touches `document`, so it only loads in the browser. */
const MDEditor = dynamic(() => import("@uiw/react-md-editor").then((mod) => mod.default), {
  ssr: false,
  loading: () => <div className="bg-surface-2 h-48 animate-pulse rounded-xl border" />,
});

/** Formatting basics only, as before: no image upload, help or fullscreen. */
const TEXT_COMMANDS: MDEditorProps["commands"] = [
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.code,
  commands.divider,
  commands.quote,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.link,
  commands.table,
];

/** The page's theme, read from `data-theme` on <html> (what the apps' theme switch sets) and followed as it changes. */
function useColorMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setMode(root.getAttribute("data-theme") === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

const wordsIn = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * Write a report in markdown with a live preview, as on the old bounty page.
 * Follows the app theme; the word counter warns near `maxWords`.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled,
  minHeight = 180,
  maxWords,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  maxWords?: number;
}) {
  const colorMode = useColorMode();
  const words = wordsIn(value);
  const left = maxWords ? maxWords - words : null;

  return (
    <div className={cn("grid gap-1.5", disabled && "pointer-events-none opacity-60")}>
      <div
        className="[&_.w-md-editor]:bg-surface-2 [&_.w-md-editor-toolbar]:bg-surface [&_.w-md-editor]:text-fg overflow-hidden rounded-xl border [&_.w-md-editor]:!rounded-xl [&_.w-md-editor]:!border-0 [&_.w-md-editor]:!shadow-none [&_.w-md-editor-toolbar]:border-b"
        data-color-mode={colorMode}
      >
        <MDEditor
          value={value}
          onChange={(next) => onChange(next ?? "")}
          preview="live"
          commands={TEXT_COMMANDS}
          extraCommands={[]}
          height={minHeight}
          visibleDragbar={false}
          textareaProps={{ placeholder, "aria-label": placeholder }}
          components={{ preview: (source) => <Markdown content={source} compact /> }}
        />
      </div>
      {left !== null && (
        <p
          className={cn(
            "text-right text-xs tabular-nums",
            left < 0 ? "text-destructive" : left < 50 ? "text-primary-text" : "text-fg-faint",
          )}
        >
          {words.toLocaleString()} / {maxWords?.toLocaleString()} words
        </p>
      )}
    </div>
  );
}
