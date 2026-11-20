"use client";

import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import type {
  HotspotTemplateData,
  PinTemplateData,
  PinTemplateFormType,
} from "@actiontokens/ar-core/pin-template";
import { Button } from "@actiontokens/ui/components/button";
import { Checkbox } from "@actiontokens/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import { Input } from "@actiontokens/ui/components/input";
import { Label } from "@actiontokens/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@actiontokens/ui/components/radio-group";

import { api } from "~/trpc/react";

/**
 * "Save as template": a name, and whether to keep the location (pin) or the drawn area
 * (hotspot). `build` turns the form's current values into the template's data when you press
 * Save. A form that started from a template can also update that template.
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  formType,
  defaultName,
  location,
  build,
  from,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formType: PinTemplateFormType;
  defaultName?: string;
  /** What the "include" option would keep, e.g. "23.8103, 90.4125", or null when there is none. */
  location: string | null;
  build: (includeLocation: boolean) => PinTemplateData | HotspotTemplateData;
  /** The template this form was started from, if any */
  from?: { id: string; name: string } | null;
  onSaved?: (template: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [includeLocation, setIncludeLocation] = useState(location !== null);
  const [mode, setMode] = useState<"new" | "update">(from ? "update" : "new");
  // Each time it opens, start from the form's current title and location.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(defaultName ?? "");
      setIncludeLocation(location !== null);
      setMode(from ? "update" : "new");
    }
  }

  const utils = api.useUtils();
  const done = (template: { id: string; name: string }, message: string) => {
    void utils.templates.invalidate();
    toast.success(message);
    onOpenChange(false);
    onSaved?.(template);
  };
  const fail = (error: { message: string }) => toast.error(error.message);
  const create = api.templates.create.useMutation({
    onSuccess: (template) => done(template, `Saved as template “${template.name}”`),
    onError: fail,
  });
  const update = api.templates.update.useMutation({
    onSuccess: (template) => done(template, `Updated “${template.name}”`),
    onError: fail,
  });
  const busy = create.isPending || update.isPending;

  const what = formType === "PIN" ? "location" : "drawn area";
  const trimmed = name.trim();
  const updating = Boolean(from) && mode === "update";

  const submit = () => {
    if ((!updating && !trimmed) || busy) return;
    const data = build(includeLocation && location !== null);
    if (updating && from) return void update.mutate({ id: from.id, data });
    if (formType === "PIN")
      create.mutate({ name: trimmed, formType, data: data as PinTemplateData });
    else create.mutate({ name: trimmed, formType, data: data as HotspotTemplateData });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Reuse this {formType === "PIN" ? "pin" : "hotspot"} setup later. Dates are saved as a
            duration, so the template never goes out of date.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation(); // the page's own form is around this dialog in the React tree
            submit();
          }}
        >
          {from && (
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as "new" | "update")}
              className="grid gap-2"
            >
              <Label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
                <RadioGroupItem value="update" />
                Update “{from.name}”
              </Label>
              <Label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
                <RadioGroupItem value="new" />
                Save as a new template
              </Label>
            </RadioGroup>
          )}

          {!updating && (
            <div className="grid gap-1.5">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                autoFocus
                maxLength={80}
                value={name}
                placeholder={formType === "PIN" ? "e.g. Weekend coffee drop" : "e.g. Park art hunt"}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}

          <label
            htmlFor="template-include-location"
            className="hover:border-line-bright flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <Checkbox
              id="template-include-location"
              className="mt-0.5"
              checked={includeLocation && location !== null}
              disabled={location === null}
              onCheckedChange={(checked) => setIncludeLocation(checked === true)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Include the {what}</span>
              <span className="text-fg-muted mt-0.5 flex items-center gap-1 text-xs">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">
                  {location ?? `No ${what} yet. You'll choose one each time you use it.`}
                </span>
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={(!updating && !trimmed) || busy}>
              {busy && <Loader2 className="animate-spin" />}
              {updating ? "Update template" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
