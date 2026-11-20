"use client";

import {
  Briefcase,
  ChevronDown,
  Loader2,
  Maximize2,
  Minimize2,
  PartyPopper,
  PenLine,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import type { FillForm } from "@actiontokens/api";
import { Button } from "@actiontokens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@actiontokens/ui/components/dropdown-menu";

import { api } from "~/trpc/react";

import { AiQuota } from "./shared";

type Mode = "write" | "improve" | "shorter" | "longer" | "fun" | "professional";
const REWRITES: { mode: Mode; label: string; icon: typeof PenLine }[] = [
  { mode: "improve", label: "Improve writing", icon: Sparkles },
  { mode: "shorter", label: "Make shorter", icon: Minimize2 },
  { mode: "longer", label: "Make longer", icon: Maximize2 },
  { mode: "fun", label: "More fun", icon: PartyPopper },
  { mode: "professional", label: "More professional", icon: Briefcase },
];

/**
 * The AI button for one text field. Empty field: "Write with AI" (one click).
 * With text: a menu of rewrites. Uses the rest of the form as context and
 * offers an undo after every change.
 */
export function AiTextButton({
  form,
  field,
  value,
  onChange,
  context,
  maxChars,
}: {
  form: FillForm;
  /** Human name of the field, e.g. "title" or "description". */
  field: string;
  value: string;
  onChange: (text: string) => void;
  context?: Record<string, string>;
  maxChars?: number;
}) {
  const [previous, setPrevious] = useState<string | null>(null);
  const write = api.ai.writeField.useMutation({
    onError: (error) => toast.error(error.message),
    onSuccess: ({ text }, request) => {
      setPrevious(request.current ?? "");
      onChange(text);
    },
  });

  const run = (mode: Mode) => {
    write.mutate({ form, field, mode, current: value, maxChars, context: context ?? {} });
  };
  const trigger = "h-7 gap-1.5 px-2.5 text-xs";

  return (
    <div className="flex items-center gap-1">
      {previous !== null && !write.isPending && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            onChange(previous);
            setPrevious(null);
          }}
        >
          <Undo2 className="size-3.5" /> Undo
        </Button>
      )}
      {value.trim().length === 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={trigger}
          disabled={write.isPending}
          onClick={() => run("write")}
        >
          {write.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PenLine className="text-primary-text size-3.5" />
          )}
          Write with AI
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={trigger}
              disabled={write.isPending}
            >
              {write.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="text-primary-text size-3.5" />
              )}
              AI
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="flex items-center justify-between text-xs font-normal">
              Rewrite {field}
              <AiQuota kind="text" className="text-[10px]" />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {REWRITES.map((entry) => (
              <DropdownMenuItem key={entry.mode} onSelect={() => run(entry.mode)}>
                <entry.icon className="text-fg-muted size-4" /> {entry.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => run("write")}>
              <PenLine className="text-fg-muted size-4" /> Write a new one
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
