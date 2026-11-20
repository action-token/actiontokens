"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PinTemplateFormType } from "@actiontokens/ar-core/pin-template";

import { api } from "~/trpc/react";

import type { HotspotTemplateRow, PinTemplateRow, TemplateRow } from "./template-picker";

/**
 * A form that can start from a template: `?template=<id>` (from Pins › Templates, "Use") fills
 * it once when the template loads; the "Start from template" picker calls `use` with the one the
 * artist picked. `active` is the template the form started from, so Save as template can offer to
 * update it.
 */
export function useFormTemplate<K extends PinTemplateFormType>(
  formType: K,
  apply: (template: K extends "PIN" ? PinTemplateRow : HotspotTemplateRow) => void,
) {
  const id = useSearchParams()?.get("template") ?? "";
  const loaded = api.templates.get.useQuery({ id }, { enabled: id !== "", retry: false });
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const template = loaded.data;
    if (done.current || !template || template.formType !== formType) return;
    done.current = true;
    setActive({ id: template.id, name: template.name });
    apply(template as never);
  }, [loaded.data, formType, apply]);

  return {
    active,
    /** The picker's choice */
    use: (template: TemplateRow) => {
      if (template.formType !== formType) return;
      done.current = true;
      setActive({ id: template.id, name: template.name });
      apply(template as never);
    },
  };
}
