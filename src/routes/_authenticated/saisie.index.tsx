import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/saisie/")({
  head: () => ({
    meta: [
      { title: "Mes campagnes — ICORP Terrain" },
      { name: "description", content: "Campagnes de saisie ouvertes pour votre zone." },
      { property: "og:title", content: "Mes campagnes — ICORP Terrain" },
      { property: "og:description", content: "Saisie des fiches élèves sur le terrain." },
    ],
  }),
  component: MyCampaigns,
});

function MyCampaigns() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stats_my_zone"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stats_my_zone");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader title="Mes campagnes" description="Choisissez une campagne pour saisir des fiches." />
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : error ? (
        <EmptyState icon={CalendarRange} title="Accès réservé aux comptes zone" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Aucune campagne ouverte"
          description="Revenez lorsque l'administrateur aura ouvert une campagne."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data ?? []).map((c) => (
            <Link
              key={c.campaign_id}
              to="/saisie/$campaignId"
              params={{ campaignId: c.campaign_id }}
              className="card-surface flex items-center justify-between gap-3 p-5 transition-shadow hover:shadow-[var(--shadow-float)]"
            >
              <div>
                <p className="text-lg font-semibold">{c.campaign_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {Number(c.total_count)} fiche(s) saisie(s) par votre zone
                </p>
              </div>
              <ChevronRight className="size-5 text-primary" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
