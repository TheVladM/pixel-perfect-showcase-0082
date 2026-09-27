import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarRange, FileText, PenLine, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCampaigns } from "@/lib/queries";
import { campaignStatus, isCampaignOpen } from "@/lib/format";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/tableau-de-bord")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — ICORP Terrain" },
      {
        name: "description",
        content: "Chiffres clés des campagnes de saisie ICORP selon votre rôle et votre périmètre.",
      },
      { property: "og:title", content: "Tableau de bord — ICORP Terrain" },
      {
        property: "og:description",
        content: "Suivi des fiches élèves par région et par zone.",
      },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
}) {
  return (
    <div className="card-surface flex items-center gap-4 p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ZoneTable({ campaignId }: { campaignId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stats_by_zone", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stats_by_zone", {
        _campaign_id: campaignId ?? undefined,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!data || data.length === 0) {
    return <EmptyState icon={FileText} title="Aucune donnée à afficher" />;
  }

  const grouped = new Map<string, typeof data>();
  for (const row of data) {
    const list = grouped.get(row.region_name) ?? [];
    list.push(row);
    grouped.set(row.region_name, list);
  }

  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([region, rows]) => {
        const total = rows.reduce((sum, r) => sum + Number(r.total), 0);
        return (
          <div key={region} className="card-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-primary-soft/60 px-4 py-3">
              <p className="font-semibold text-primary">{region}</p>
              <p className="text-sm font-semibold">{total} fiches</p>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.zone_code} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">
                    {r.zone_name}{" "}
                    <span className="text-xs text-muted-foreground">({r.zone_code})</span>
                  </span>
                  <span className="text-sm font-semibold">{Number(r.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: campaigns } = useCampaigns();
  const [campaignId, setCampaignId] = useState<string>("all");

  const role = me?.role ?? null;
  const canSeeAll = role === "admin_principal" || role === "dg" || role === "promoteur";

  const overview = useQuery({
    queryKey: ["stats_overview"],
    enabled: canSeeAll,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stats_overview");
      if (error) throw error;
      return data as {
        total_records: number;
        records_today: number;
        open_campaigns: number;
        active_accounts: number;
      };
    },
  });

  const myZone = useQuery({
    queryKey: ["stats_my_zone"],
    enabled: role === "zone",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stats_my_zone");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (meLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description={
          me?.zoneName
            ? `Zone ${me.zoneName} (${me.zoneCode})`
            : me?.regionName
              ? `Région ${me.regionName}`
              : "Année scolaire 2026-2027"
        }
      />

      {role === "admin_logistique" ? (
        <div className="card-surface p-6">
          <h2 className="text-lg font-semibold">Bienvenue {me?.accountName}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre espace commandes sera disponible prochainement.
          </p>
        </div>
      ) : null}

      {canSeeAll ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {overview.isLoading ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : (
              <>
                <StatCard
                  label="Fiches au total"
                  value={overview.data?.total_records ?? 0}
                  icon={FileText}
                />
                <StatCard
                  label="Fiches aujourd'hui"
                  value={overview.data?.records_today ?? 0}
                  icon={PenLine}
                />
                <StatCard
                  label="Campagnes ouvertes"
                  value={overview.data?.open_campaigns ?? 0}
                  icon={CalendarRange}
                />
                <StatCard
                  label="Comptes actifs"
                  value={overview.data?.active_accounts ?? 0}
                  icon={Users}
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium">Campagne :</p>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="h-11 w-full sm:w-72">
                <SelectValue placeholder="Toutes les campagnes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les campagnes</SelectItem>
                {(campaigns ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {campaignStatus(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ZoneTable campaignId={campaignId === "all" ? null : campaignId} />
        </div>
      ) : null}

      {role === "superviseur" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium">Campagne :</p>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="h-11 w-full sm:w-72">
                <SelectValue placeholder="Toutes les campagnes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les campagnes</SelectItem>
                {(campaigns ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {campaignStatus(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Statistiques agrégées des zones de votre région. Les fiches individuelles ne sont pas
            accessibles.
          </p>
          <ZoneTable campaignId={campaignId === "all" ? null : campaignId} />
        </div>
      ) : null}

      {role === "zone" ? (
        <div className="space-y-5">
          <Button asChild className="h-14 w-full text-base sm:w-auto sm:px-10">
            <Link to="/saisie">
              <PenLine className="size-5" /> Nouvelle fiche
            </Link>
          </Button>
          {myZone.isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : (myZone.data ?? []).length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Aucune campagne ouverte"
              description="Aucune campagne de saisie n'est ouverte pour le moment."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(myZone.data ?? []).map((c) => (
                <div key={c.campaign_id} className="card-surface p-4">
                  <p className="font-semibold">{c.campaign_name}</p>
                  <div className="mt-3 flex gap-6">
                    <div>
                      <p className="text-2xl font-bold">{Number(c.today_count)}</p>
                      <p className="text-xs text-muted-foreground">Aujourd'hui</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{Number(c.total_count)}</p>
                      <p className="text-xs text-muted-foreground">Au total</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(campaigns ?? []).filter(isCampaignOpen).length === 0 ? null : null}
        </div>
      ) : null}
    </div>
  );
}
