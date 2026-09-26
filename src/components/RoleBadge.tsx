import { ROLE_LABELS, type AppRole } from "@/lib/session";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<AppRole, string> = {
  admin_principal: "bg-primary text-primary-foreground",
  admin_logistique: "bg-accent text-accent-foreground",
  dg: "bg-chart-3/15 text-chart-3",
  promoteur: "bg-chart-5/15 text-chart-5",
  superviseur: "bg-success/15 text-success",
  zone: "bg-primary-soft text-primary",
};

export function RoleBadge({ role, className }: { role: AppRole | null; className?: string }) {
  if (!role) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        Aucun rôle
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        ROLE_STYLES[role],
        className,
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
