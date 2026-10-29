"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { ItemForm } from "./item-form";

export function NewItemView() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/items", label: "Items" }} eyebrow="Catalog" title="New item" description="Set what it is, what it costs and how many copies exist. You can edit most of it later." />
      <ItemForm />
    </PageBody>
  );
}

export function EditItemView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const item = api.catalog.get.useQuery({ itemId });
  const [deleting, setDeleting] = useState(false);
  const remove = api.catalog.remove.useMutation({
    onSuccess: () => {
      toast.success("Item deleted");
      void utils.catalog.list.invalidate();
      router.push("/items");
    },
    onError: (error) => {
      setDeleting(false);
      toast.error(error.message);
    },
  });

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={{ href: "/items", label: "Items" }}
        eyebrow="Catalog"
        title={item.data?.title ?? "Edit item"}
        actions={
          item.data && (
            <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          )
        }
      />
      {item.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : item.isError ? (
        <ErrorState message={item.error.message} onRetry={() => void item.refetch()} />
      ) : (
        <>
          <ItemForm existing={item.data} />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete ${item.data.title}?`}
            description={item.data.locked ? "This item has sales, so it can't be deleted. Hide it by unpublishing instead." : "It disappears from your page. This can't be undone."}
            confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
            busy={remove.isPending}
            onConfirm={() => remove.mutate({ itemId })}
          />
        </>
      )}
    </PageBody>
  );
}
