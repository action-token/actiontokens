"use client";

import {
  Copy,
  LayoutTemplate,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Radar,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { describeMinutes } from "@actiontokens/ar-core/pin-template";
import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@actiontokens/ui/components/dropdown-menu";
import { Input } from "@actiontokens/ui/components/input";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@actiontokens/ui/components/tabs";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { TemplateThumb, type TemplateRow } from "./template-picker";

type Kind = "PIN" | "HOTSPOT";

/**
 * Pins › Templates: your saved pin and hotspot setups. Use one to make a new pin or hotspot,
 * rename it, copy it, or delete it. (To change what is in one, use it, adjust the form and choose
 * Save as template › Update.)
 */
export default function TemplatesPage() {
  const [tab, setTab] = useState<Kind>("PIN");
  const list = api.templates.list.useQuery();
  const rows = list.data ?? [];
  const pins = rows.filter((template) => template.formType === "PIN");
  const hotspots = rows.filter((template) => template.formType === "HOTSPOT");

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Drops"
        title="Templates"
        description="Saved pin and hotspot setups. Use one to make a new pin or hotspot in a few clicks."
        back={{ href: "/pins/manage", label: "Pin management" }}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/hotspots/new">
                <Radar /> New hotspot
              </Link>
            </Button>
            <Button asChild>
              <Link href="/pins/new">
                <Plus /> New pin
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as Kind)}>
        <TabsList>
          <TabsTrigger value="PIN">Pins ({pins.length})</TabsTrigger>
          <TabsTrigger value="HOTSPOT">Hotspots ({hotspots.length})</TabsTrigger>
        </TabsList>
        {(["PIN", "HOTSPOT"] as const).map((kind) => {
          const shown = kind === "PIN" ? pins : hotspots;
          return (
            <TabsContent key={kind} value={kind} className="mt-5">
              {list.isPending ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((key) => (
                    <Skeleton key={key} className="h-36 rounded-[1.4rem]" />
                  ))}
                </div>
              ) : list.isError ? (
                <p className="text-danger text-sm">
                  Couldn&apos;t load your templates.{" "}
                  <button className="underline" onClick={() => void list.refetch()}>
                    Try again
                  </button>
                </p>
              ) : shown.length === 0 ? (
                <EmptyState
                  icon={LayoutTemplate}
                  title="No templates yet"
                  description={`Fill in a new ${kind === "PIN" ? "pin" : "hotspot"} and choose Save as template to reuse it here.`}
                  action={
                    <Button asChild>
                      <Link href={kind === "PIN" ? "/pins/new" : "/hotspots/new"}>
                        <Plus /> New {kind === "PIN" ? "pin" : "hotspot"}
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </PageBody>
  );
}

function TemplateCard({ template }: { template: TemplateRow }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [confirm, setConfirm] = useState(false);
  const [rename, setRename] = useState<string | null>(null);

  const duplicate = api.templates.duplicate.useMutation({
    onSuccess: (copy) => {
      void utils.templates.invalidate();
      toast.success(`Copied as “${copy.name}”`);
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = api.templates.delete.useMutation({
    onSuccess: () => {
      void utils.templates.invalidate();
      setConfirm(false);
      toast.success("Template deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const renamed = api.templates.update.useMutation({
    onSuccess: () => {
      void utils.templates.invalidate();
      setRename(null);
      toast.success("Renamed");
    },
    onError: (error) => toast.error(error.message),
  });

  const runs =
    template.formType === "PIN"
      ? template.data.durationMinutes &&
        `Each pin runs ${describeMinutes(template.data.durationMinutes)}`
      : template.data.scheduleDays &&
        `Drops for ${template.data.scheduleDays} day${template.data.scheduleDays === 1 ? "" : "s"}`;
  const use = () =>
    router.push(
      template.formType === "PIN"
        ? `/pins/new?template=${template.id}`
        : `/hotspots/new?template=${template.id}`,
    );

  return (
    <article className="bg-surface border-fg/10 flex flex-col rounded-[1.4rem] border-2 p-4">
      <div className="flex items-start gap-3">
        <TemplateThumb template={template} className="size-14" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{template.name}</h3>
          <p className="text-fg-muted truncate text-sm">{template.data.title ?? "Untitled"}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${template.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRename(template.name)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={duplicate.isPending}
              onSelect={() => duplicate.mutate({ id: template.id })}
            >
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="text-danger" onSelect={() => setConfirm(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ul className="text-fg-muted mt-3 space-y-1 text-xs">
        <li className="flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          {template.hasLocation
            ? template.formType === "PIN"
              ? "Includes a location"
              : `Includes a ${template.data.area?.shape ?? "drawn"} area`
            : template.formType === "PIN"
              ? "Choose the spot each time"
              : "Draw the area each time"}
        </li>
        {runs && <li>{runs}</li>}
        <li>Updated {new Date(template.updatedAt).toLocaleDateString()}</li>
      </ul>

      <Button className="mt-4" onClick={use}>
        Use
      </Button>

      <Dialog open={rename !== null} onOpenChange={(open) => !open && setRename(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename template</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (rename?.trim()) renamed.mutate({ id: template.id, name: rename.trim() });
            }}
          >
            <Input
              autoFocus
              maxLength={80}
              value={rename ?? ""}
              aria-label="Template name"
              onChange={(event) => setRename(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRename(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!rename?.trim() || renamed.isPending}>
                {renamed.isPending && <Loader2 className="animate-spin" />} Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this template?"
        description={`“${template.name}” will be removed. Pins already made from it stay as they are.`}
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ id: template.id })}
      />
    </article>
  );
}
