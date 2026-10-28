import * as React from "react";
import { cn } from "../lib/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-surface-2 placeholder:text-fg-faint focus-visible:border-primary-text focus-visible:ring-primary-soft aria-invalid:border-destructive flex field-sizing-content min-h-24 w-full rounded-md border px-3 py-2.5 text-base transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
