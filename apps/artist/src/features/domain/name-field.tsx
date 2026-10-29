"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { normalizeVanityName, validateVanityName } from "@bandcoin/utils/vanity";

import { api } from "~/trpc/react";

import { VANITY_HOST } from "./host";

function useDebounced<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * The part of the link the artist chooses. Checks the rules as they type, then
 * asks the server whether the name is free. `onChange` gets the name only when
 * it is usable (else null), so the page can't pay for a name that won't work.
 */
export function NameField({
  value,
  onValue,
  onUsable,
  current,
}: {
  value: string;
  onValue: (value: string) => void;
  onUsable: (name: string | null) => void;
  /** Their present link, which is not "taken" for them */
  current?: string;
}) {
  const name = normalizeVanityName(value);
  const settled = useDebounced(name);
  const problem = name ? validateVanityName(name) : null;
  const check = api.vanity.check.useQuery(
    { name: settled },
    { enabled: Boolean(settled) && settled === name && !problem && settled !== current },
  );

  const usable =
    Boolean(name) &&
    !problem &&
    settled === name &&
    name !== current &&
    check.data?.ok === true &&
    check.data.name === name;
  useEffect(() => onUsable(usable ? name : null), [usable, name, onUsable]);

  const checking = Boolean(name) && !problem && (settled !== name || check.isFetching);
  const taken = check.data && !check.data.ok && check.data.name === name ? check.data.reason : null;

  return (
    <div className="grid gap-2">
      <Label htmlFor="vanity-name">Your link</Label>
      <div className="bg-surface focus-within:ring-ring flex items-center overflow-hidden rounded-md border focus-within:ring-2">
        <span className="bg-surface-2 text-fg-muted shrink-0 border-r px-3 py-2 text-sm">
          {VANITY_HOST}/
        </span>
        <Input
          id="vanity-name"
          value={value}
          maxLength={30}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder="your-name"
          className="min-w-0 flex-1 rounded-none border-0 shadow-none focus-visible:ring-0"
          onChange={(event) => onValue(event.target.value.toLowerCase())}
        />
      </div>
      <p className="min-h-5 text-xs" aria-live="polite">
        {problem ? (
          <span className="text-danger">{problem}</span>
        ) : checking ? (
          <span className="text-fg-muted">Checking…</span>
        ) : taken ? (
          <span className="text-danger inline-flex items-center gap-1">
            <X className="size-3.5" /> {taken}
          </span>
        ) : usable ? (
          <span className="text-success inline-flex items-center gap-1">
            <Check className="size-3.5" /> Available
          </span>
        ) : (
          <span className="text-fg-muted">2–30 letters, numbers, - or _</span>
        )}
      </p>
    </div>
  );
}
