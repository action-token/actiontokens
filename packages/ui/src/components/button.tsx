import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out-soft outline-none active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-primary-text/40 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** The one main action of a view: Pay, Publish, Claim. */
        default: "bg-primary text-primary-foreground hover:bg-primary-strong",
        secondary: "bg-surface-3 text-fg hover:bg-border-strong",
        outline: "border-border bg-transparent text-fg hover:border-border-strong hover:bg-surface-2",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        destructive: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
        link: "h-auto rounded-none px-0 text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-sm has-[>svg]:px-3.5",
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-[52px] px-6 text-base",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
