import emblemAsset from "@/assets/icorp-emblem.png.asset.json";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookUser,
  Building2,
  CalendarRange,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Package,
  ShoppingCart,
  ClipboardList,
  MoreHorizontal,
  PenLine,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleBadge } from "@/components/RoleBadge";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMe, type AppRole, type Me } from "@/lib/session";

type NavItem = { to: string; label: string; short: string; icon: LucideIcon; roles: AppRole[] };

const NAV: NavItem[] = [
  {
    to: "/tableau-de-bord",
    label: "Tableau de bord",
    short: "Accueil",
    icon: LayoutDashboard,
    roles: ["admin_principal", "admin_logistique", "dg", "promoteur", "superviseur", "zone"],
  },
  { to: "/saisie", label: "Mes campagnes", short: "Saisie", icon: PenLine, roles: ["zone"] },
  {
    to: "/fiches",
    label: "Fiches élèves",
    short: "Fiches",
    icon: FileText,
    roles: ["admin_principal", "dg", "promoteur", "zone"],
  },
  { to: "/commander", label: "Catalogue", short: "Commander", icon: ShoppingCart, roles: ["zone"] },
  { to: "/mes-commandes", label: "Mes commandes", short: "Commandes", icon: ClipboardList, roles: ["zone"] },
  {
    to: "/commandes",
    label: "Commandes",
    short: "Commandes",
    icon: ClipboardList,
    roles: ["admin_principal", "admin_logistique", "dg", "promoteur"],
  },
  { to: "/catalogue", label: "Catalogue", short: "Catalogue", icon: Package, roles: ["admin_principal"] },
  {
    to: "/campagnes",
    label: "Campagnes",
    short: "Campagnes",
    icon: CalendarRange,
    roles: ["admin_principal"],
  },
  { to: "/comptes", label: "Comptes", short: "Comptes", icon: Users, roles: ["admin_principal"] },
  {
    to: "/etablissements",
    label: "Établissements",
    short: "Écoles",
    icon: Building2,
    roles: ["admin_principal"],
  },
  {
    to: "/regions-zones",
    label: "Régions et zones",
    short: "Zones",
    icon: Map,
    roles: ["admin_principal"],
  },
  {
    to: "/classes-series",
    label: "Classes et séries",
    short: "Classes",
    icon: GraduationCap,
    roles: ["admin_principal"],
  },
  {
    to: "/intervenants",
    label: "Intervenants",
    short: "Intervenants",
    icon: BookUser,
    roles: ["admin_principal"],
  },
  {
    to: "/journal-audit",
    label: "Journal d'audit",
    short: "Audit",
    icon: ShieldCheck,
    roles: ["admin_principal"],
  },
  {
    to: "/journal-connexion",
    label: "Journal de connexion",
    short: "Connexions",
    icon: ScrollText,
    roles: ["admin_principal"],
  },
];

function itemsForRole(role: AppRole | null): NavItem[] {
  if (!role) return [];
  return NAV.filter((i) => i.roles.includes(role));
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-16 items-center justify-center rounded-lg bg-card px-1">
        <img src={emblemAsset.url} alt="Logo ICORP" className="h-full w-full object-contain" />
      </span>
      <span className={cn("leading-tight", compact && "sr-only")}>
        <span className="block text-sm font-bold tracking-wide">ICORP</span>
        <span className="block text-xs opacity-75">Terrain</span>
      </span>
    </div>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
        >
          <item.icon className="size-5 shrink-0" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function AccountBlock({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  return (
    <div className="space-y-2">
      <p className="truncate text-sm font-semibold text-sidebar-foreground">{me.accountName}</p>
      <RoleBadge role={me.role} />
      {me.zoneName ? (
        <p className="text-xs text-sidebar-foreground/70">
          Zone {me.zoneName} ({me.zoneCode})
        </p>
      ) : null}
      {!me.zoneName && me.regionName ? (
        <p className="text-xs text-sidebar-foreground/70">Région {me.regionName}</p>
      ) : null}
      <button
        onClick={onSignOut}
        className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
      >
        <LogOut className="size-4" /> Se déconnecter
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = itemsForRole(me?.role ?? null);
  const primary = items.slice(0, items.length > 5 ? 4 : 5);
  const extra = items.slice(primary.length);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between bg-sidebar p-4 lg:flex">
        <div className="space-y-6">
          <div className="flex items-center justify-between text-sidebar-foreground">
            <Brand />
            {me ? <NotificationBell userId={me.userId} /> : null}
          </div>
          {me ? <NavLinks items={items} /> : null}
        </div>
        {me ? <AccountBlock me={me} onSignOut={handleSignOut} /> : null}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {me ? (
            <div className="text-right">
              <p className="max-w-[9rem] truncate text-xs font-semibold">{me.accountName}</p>
              <RoleBadge role={me.role} className="mt-0.5" />
            </div>
          ) : null}
          {me ? <NotificationBell userId={me.userId} /> : null}
          <Sheet>
            <SheetTrigger asChild>
              <button
                aria-label="Menu"
                className="flex size-11 items-center justify-center rounded-lg hover:bg-sidebar-accent"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-sidebar text-sidebar-foreground">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-full flex-col justify-between p-4">
                <div className="space-y-6">
                  <Brand />
                  <NavLinks items={items} />
                </div>
                {me ? <AccountBlock me={me} onSignOut={handleSignOut} /> : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="px-4 pb-28 pt-4 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>

      {/* Mobile bottom navigation */}
      {items.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur lg:hidden">
          {primary.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
                {item.short}
              </Link>
            );
          })}
          {extra.length > 0 ? (
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button className="flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground">
                  <MoreHorizontal className="size-5" />
                  Plus
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetTitle className="px-4 pt-4">Plus d'options</SheetTitle>
                <div className="grid grid-cols-2 gap-2 p-4">
                  {extra.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-3 text-xs font-medium"
                    >
                      <item.icon className="size-5 text-primary" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export { Button };
