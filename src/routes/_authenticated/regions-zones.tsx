import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Map as MapIcon } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegions, useZones } from "@/lib/queries";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/regions-zones")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Régions et zones — ICORP Terrain" },
      { name: "description", content: "Vue d'ensemble des régions et de leurs zones." },
      { property: "og:title", content: "Régions et zones — ICORP Terrain" },
      { property: "og:description", content: "Organisation territoriale ICORP." },
    ],
  }),
  component: RegionsZonesPage,
});

function RegionsZonesPage() {
  const { data: regions, isLoading: regionsLoading } = useRegions();
  const { data: zones, isLoading: zonesLoading } = useZones();

  const zonesByRegion = useMemo(() => {
    const m = new Map<string, NonNullable<typeof zones>>();
    for (const z of zones ?? []) {
      const list = m.get(z.region_id) ?? [];
      list.push(z);
      m.set(z.region_id, list);
    }
    return m;
  }, [zones]);

  if (regionsLoading || zonesLoading) {
    return (
      <div>
        <PageHeader title="Régions et zones" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Régions et zones"
        description={`${regions?.length ?? 0} région(s), ${zones?.length ?? 0} zone(s). Consultation uniquement.`}
      />
      {!regions?.length ? (
        <EmptyState icon={MapIcon} title="Aucune région" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {regions.map((r) => {
            const list = zonesByRegion.get(r.id) ?? [];
            return (
              <div key={r.id} className="card-surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-primary-soft/60 px-4 py-3">
                  <p className="font-semibold text-primary">
                    {r.name} <span className="text-xs font-medium">({r.code})</span>
                  </p>
                  <p className="text-sm font-semibold">{list.length} zone(s)</p>
                </div>
                {list.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Aucune zone.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {list.map((z) => (
                      <li key={z.id} className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm">{z.name}</span>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                          {z.code}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
