import { cn } from "@/lib/utils";

interface VignetteProps {
  className?: string;
}

export function Vignette({ className }: VignetteProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-50 mix-blend-multiply",
        "shadow-[inset_0_0_120px_rgba(0,0,0,0.1)]", // Subtle inner shadow/vignette
        "dark:shadow-[inset_0_0_120px_rgba(0,0,0,0.5)]", // Darker vignette for dark mode
        // For the "portal" effect, we can add a very subtle blur at the edges if browser support allows,
        // but inset shadow is the robust way to do it.
        // Let's also add a subtle noise texture if desired, but keeping it clean for now.
        className
      )}
    />
  );
}
