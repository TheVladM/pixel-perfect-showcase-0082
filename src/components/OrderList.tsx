import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Package, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABELS, useOrders, type OrderStatus } from "@/lib/orders";
import { useRegions, useZones } from "@/lib/queries";

export function OrderList({ mode }: { mode: "zone" | "all" }) {
  const { data, isLoading } = useOrders();
  const { data: regions } = useRegions();
  const { data: zones } = useZones();
  const [status, setStatus] = useState("all");
  const [region, setRegion] = useState("all");
  const [zone, setZone] = useState("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter((o) => {
      const z = o.zones as { region_id: string } | null;
      if (status !== "all" && o.status !== status) return false;
      if (mode === "all") {
        if (region !== "all" && z?.region_id !== region) return false;
        if (zone !== "all" && o.zone_id !== zone) return false;
        if (s && !(o.order_number ?? "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [data, status, region, zone, search, mode]);

  const zoneOptions = (zones ?? []).filter((z) => region === "all" || z.region_id === region);
  const base = mode === "zone" ? "/mes-commandes/$orderId" : "/commandes/$orderId";

  return (
    <div className="space-y-4">
      <div className={mode === "all" ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-4" : "max-w-xs"}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((k) => (
              <SelectItem key={k} value={k}>{ORDER_STATUS_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === "all" ? (
          <>
            <Select value={region} onValueChange={(v) => { setRegion(v); setZone("all"); }}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les régions</SelectItem>
                {regions?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                {zoneOptions.map((z) => <SelectItem key={z.id} value={z.id}>{z.name} ({z.code})</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-11 pl-9" placeholder="N° de commande (BC-…)" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Package} title="Aucune commande" description="Aucune commande ne correspond à ces critères." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((o) => {
            const z = o.zones as { name: string; code: string; regions: { name: string } | null } | null;
            const count = (o.order_items as { retained_quantity: number }[]).filter((i) => Number(i.retained_quantity) > 0).length;
            return (
              <Link
                key={o.id}
                to={base}
                params={{ orderId: o.id }}
                className="card-surface block p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{o.order_number ?? "En attente de numéro"}</p>
                    {mode === "all" && z ? (
                      <p className="truncate text-sm text-muted-foreground">{z.name} ({z.code}) · {z.regions?.name}</p>
                    ) : null}
                  </div>
                  <OrderStatusBadge status={o.status as OrderStatus} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {count} produit{count > 1 ? "s" : ""} · {formatDateTime(o.created_at)} · {o.agent_name}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
