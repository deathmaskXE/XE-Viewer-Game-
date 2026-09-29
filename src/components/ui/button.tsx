import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border border-transparent font-medium text-sm transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        primary: "border-cyan-200/30 bg-gradient-to-b from-[#8af0f7] via-primary to-[#16accd] text-primary-fg shadow-[inset_0_1px_rgba(255,255,255,.55),0_3px_12px_rgba(0,195,225,.14)] hover:brightness-110",
        quiet: "border-border bg-gradient-to-b from-[#203644] to-bg-subtle text-fg shadow-[inset_0_1px_rgba(225,245,255,.06)] hover:border-accent/50 hover:text-accent",
        ghost: "bg-transparent text-muted hover:bg-bg-subtle hover:text-fg",
        danger: "bg-transparent text-danger hover:bg-danger/10",
      },
      size: {
        md: "h-11 px-3",
        sm: "h-9 px-2.5",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
