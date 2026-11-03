"use client";

import { FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import type { Mixer } from "./use-mixer";

/** Your saved projects: open one, start a new one, or delete one. */
export function ProjectsMenu({ mixer }: { mixer: Mixer }) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const list = api.projects.list.useQuery(undefined, { enabled: open });
  const [loading, setLoading] = useState<string | null>(null);
  const remove = api.projects.remove.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      void utils.projects.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  async function openProject(projectId: string) {
    setLoading(projectId);
    try {
      const project = await utils.projects.get.fetch({ projectId });
      mixer.open({ projectId: project.id, name: project.name, data: project.data });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open it.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <FolderOpen /> Projects
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <button
          type="button"
          onClick={() => {
            mixer.newProject();
            setOpen(false);
          }}
          className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold"
        >
          <Plus className="size-4" /> New project
        </button>
        <div className="my-1 border-t" />
        {list.isPending ? (
          <Skeleton className="m-1 h-14" />
        ) : !list.data?.length ? (
          <p className="text-fg-muted px-2.5 py-3 text-sm">No saved projects yet.</p>
        ) : (
          <ul className="grid max-h-80 gap-0.5 overflow-y-auto">
            {list.data.map((project) => (
              <li
                key={project.id}
                className="hover:bg-surface-2 flex items-center gap-1 rounded-lg"
              >
                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() => void openProject(project.id)}
                  className="grid min-w-0 flex-1 px-2.5 py-2 text-left"
                >
                  <span className="truncate text-sm font-semibold">
                    {loading === project.id && (
                      <Loader2 className="mr-1 inline size-3.5 animate-spin" />
                    )}
                    {project.name}
                  </span>
                  <span className="text-fg-faint text-xs">
                    {project.tracks} track{project.tracks === 1 ? "" : "s"} ·{" "}
                    {timeAgo(project.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${project.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ projectId: project.id })}
                  className="text-fg-faint hover:text-danger grid size-8 shrink-0 place-items-center rounded-md"
                >
                  {remove.isPending && remove.variables.projectId === project.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
