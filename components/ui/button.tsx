import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary — brand guide default bg #7B62FF, hover #5B45E0
        default:
          "bg-[#7B62FF] text-white shadow-sm shadow-[#5B45E0]/25 hover:bg-[#5B45E0] hover:shadow-md hover:shadow-[#5B45E0]/35 disabled:bg-[#EDEDED] disabled:text-[#29253D] transition-all duration-150",
        // Kept "brand" variant alias for backwards compatibility
        brand:
          "bg-[#7B62FF] text-white shadow-sm shadow-[#5B45E0]/25 hover:bg-[#5B45E0] hover:shadow-md hover:shadow-[#5B45E0]/35 disabled:bg-[#EDEDED] disabled:text-[#29253D] transition-all duration-150",
        // Secondary = outlined purple per brand guide
        outline:
          "border-[#E5E7EB] bg-background hover:bg-[#F0ECFF] hover:text-[#5B45E0] hover:border-[#7B62FF]/40 aria-expanded:bg-[#F0ECFF] dark:border-input dark:bg-input/30 dark:hover:bg-input/50 transition-colors",
        secondary:
          "bg-[#F0ECFF] text-[#5B45E0] hover:bg-[#EEF2FE] aria-expanded:bg-[#F0ECFF]",
        ghost:
          "hover:bg-[#F0ECFF] hover:text-[#5B45E0] aria-expanded:bg-[#F0ECFF] aria-expanded:text-[#5B45E0] dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-[#5B45E0] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
