import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCampaigns, useClasses, useRegions, useSeries, useZones } from "@/lib/queries";
import { formatDateTime, frenchError, sexLabel } from "@/lib/format";
import { useMe } from "@/lib/session";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/fiches")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal", "dg", "promoteur", "zone"]),
  head: () => ({
    meta: [
      { title: "Fiches élèves — ICORP Terrain" },
      { name: "description", content: "Liste des fiches élèves saisies sur le terrain." },
      { property: "og:title", content: "Fiches élèves — ICORP Terrain" },
      { property: "og:description", content: "Consultation et filtrage des fiches élèves." },
    ],
  }),
  component: RecordsPage,
});

type Row = {
  id: string;
  last_name: string;
  first_name: string;
  sex: string;
  agent_name: string;
  created_at: string;
  is_deleted: boolean;
  deletion_reason: string | null;
  custom_values: Record<string, string>;
  fields_snapshot: { id: string; label: string }[];
  campaign_id: string;
  zone_id: string;
  class_id: string;
  series_id: string | null;
  school_id: string;
  schools: { name: string } | null;
  classes: { label: string } | null;
  series: { label: string } | null;
  zones: { name: string; code: string; region_id: string } | null;
  campaigns: { name: string } | null;
};

const ALL = "all";
const PAGE = 25;

function RecordsPage() {
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin_principal";
  const isZone = me?.role === "zone";
  const queryClient = useQueryClient();
  const { data: campaigns } = useCampaigns();
  const { data: regions } = useRegions();
  const { data: zones } = useZones();
  const { data: classes } = useClasses();
  const { data: series } = useSeries();

  const [campaign, setCampaign] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [zone, setZone] = useState(ALL);
  const [school, setSchool] = useState(ALL);
  const [klass, setKlass] = useState(ALL);
  const [serie, setSerie] = useState(ALL);
  const [sex, setSex] = useState(ALL);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("school");
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["records", campaign, zone, showDeleted],
    enabled: Boolean(me),
    queryFn: async () => {
      let q = supabase
        .from("student_records")
        .select(
          "id, last_name, first_name, sex, agent_name, created_at, is_deleted, deletion_reason, custom_values, fields_snapshot, campaign_id, zone_id, class_id, series_id, school_id, schools(name), classes(label), series(label), zones(name, code, region_id), campaigns(name)",
        )
        .limit(10000);
      if (campaign !== ALL) q = q.eq("campaign_id", campaign);
      if (zone !== ALL) q = q.eq("zone_id", zone);
      if (!showDeleted) q = q.eq("is_deleted", false);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const schoolOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data ?? []) m.set(r.school_id, r.schools?.name ?? "");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = (data ?? []).filter(
      (r) =>
        (region === ALL || r.zones?.region_id === region) &&
        (school === ALL || r.school_id === school) &&
        (klass === ALL || r.class_id === klass) &&
        (serie === ALL || r.series_id === serie) &&
        (sex === ALL || r.sex === sex) &&
        (!s || `${r.last_name} ${r.first_name}`.toLowerCase().includes(s) || `${r.first_name} ${r.last_name}`.toLowerCase().includes(s)),
    );
    rows.sort((a, b) => {
      if (sort === "date") return b.created_at.localeCompare(a.created_at);
      if (sort === "name") return a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr");
      return (
        (a.schools?.name ?? "").localeCompare(b.schools?.name ?? "", "fr") ||
        a.last_name.localeCompare(b.last_name, "fr")
      );
    });
    return rows;
  }, [data, region, school, klass, serie, sex, search, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = filtered.slice(page * PAGE, page * PAGE + PAGE);

  async function confirmDelete() {
    if (!toDelete) return;
    if (!reason.trim()) return void toast.error("Le motif est obligatoire.");
    setDeleting(true);
    const { error } = await supabase.rpc("soft_delete_record", { _id: toDelete.id, _reason: reason.trim() });
    setDeleting(false);
    if (error) return void toast.error(frenchError(error.message));
    toast.success("Fiche supprimée");
    setToDelete(null);
    setReason("");
    setDetail(null);
    queryClient.invalidateQueries({ queryKey: ["records"] });
  }

  const reset = () => setPage(0);
  const sel = (value: string, set: (v: string) => void, placeholder: string, items: [string, string][]) => (
    <Select value={value} onValueChange={(v) => { set(v); reset(); }}>
      <SelectTrigger className="h-11">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {items.map(([id, label]) => (
          <SelectItem key={id} value={id}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div>
      <PageHeader title={isZone ? "Mes fiches" : "Fiches élèves"} description={`${filtered.length} fiche(s)`} />

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un nom…" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} className="h-11 pl-9" />
        </div>
        {sel(campaign, setCampaign, "Toutes les campagnes", (campaigns ?? []).map((c) => [c.id, c.name]))}
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="school">Tri : établissement puis nom</SelectItem>
            <SelectItem value="name">Tri : nom</SelectItem>
            <SelectItem value="date">Tri : date de saisie</SelectItem>
          </SelectContent>
        </Select>
        {!isZone ? sel(region, setRegion, "Toutes les régions", (regions ?? []).map((r) => [r.id, r.name])) : null}
        {!isZone
          ? sel(zone, setZone, "Toutes les zones", (zones ?? []).filter((z) => region === ALL || z.region_id === region).map((z) => [z.id, `${z.name} (${z.code})`]))
          : null}
        {sel(school, setSchool, "Tous les établissements", schoolOptions)}
        {sel(klass, setKlass, "Toutes les classes", (classes ?? []).map((c) => [c.id, c.label]))}
        {sel(serie, setSerie, "Toutes les séries", (series ?? []).map((s) => [s.id, s.label]))}
        {sel(sex, setSex, "Tous les sexes", [["M", "Masculin"], ["F", "Féminin"]])}
        {isAdmin ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Switch checked={showDeleted} onCheckedChange={(v) => { setShowDeleted(v); reset(); }} />
            Afficher les fiches supprimées
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : error ? (
        <EmptyState icon={FileText} title="Accès non autorisé" description={frenchError((error as Error).message)} />
      ) : current.length === 0 ? (
        <EmptyState icon={FileText} title="Aucune fiche" description="Aucune fiche ne correspond à vos critères." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card-surface hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nom</th><th className="px-4 py-3">Établissement</th><th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3">Sexe</th><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {current.map((r) => (
                  <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      {r.last_name.toUpperCase()} {r.first_name}
                      {r.is_deleted ? <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">Supprimée</span> : null}
                    </td>
                    <td className="px-4 py-3">{r.schools?.name}</td>
                    <td className="px-4 py-3">{r.classes?.label}{r.series ? ` ${r.series.label}` : ""}</td>
                    <td className="px-4 py-3">{sexLabel(r.sex)}</td>
                    <td className="px-4 py-3">{r.agent_name}</td>
                    <td className="px-4 py-3">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {current.map((r) => (
              <button key={r.id} onClick={() => setDetail(r)} className="card-surface block w-full p-4 text-left">
                <p className="font-semibold">
                  {r.last_name.toUpperCase()} {r.first_name}
                  {r.is_deleted ? <span className="ml-2 text-xs text-destructive">Supprimée</span> : null}
                </p>
                <p className="text-sm text-muted-foreground">{r.schools?.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.classes?.label}{r.series ? ` ${r.series.label}` : ""} · {sexLabel(r.sex)} · {r.agent_name} · {formatDateTime(r.created_at)}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" className="h-11" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
            <span className="text-sm text-muted-foreground">Page {page + 1} / {pages}</span>
            <Button variant="outline" className="h-11" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
          </div>
        </>
      )}

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>{detail.last_name.toUpperCase()} {detail.first_name}</DialogTitle>
                <DialogDescription>{detail.campaigns?.name} · {detail.zones?.name}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Établissement", detail.schools?.name],
                  ["Classe", detail.classes?.label],
                  ["Série", detail.series?.label ?? "—"],
                  ["Sexe", sexLabel(detail.sex)],
                  ["Agent", detail.agent_name],
                  ["Date", formatDateTime(detail.created_at)],
                  ...(detail.fields_snapshot ?? []).map((f) => [f.label, detail.custom_values?.[f.id] || "—"]),
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              {detail.is_deleted ? (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Supprimée — motif : {detail.deletion_reason}</p>
              ) : null}
              {isAdmin && !detail.is_deleted ? (
                <DialogFooter>
                  <Button variant="destructive" className="h-11" onClick={() => setToDelete(detail)}>
                    <Trash2 className="size-4" /> Supprimer
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette fiche ?</DialogTitle>
            <DialogDescription>La fiche sera masquée et la suppression inscrite au journal d'audit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motif (obligatoire)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setToDelete(null)}>Annuler</Button>
            <Button variant="destructive" className="h-11" disabled={deleting} onClick={confirmDelete}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null} Confirmer la suppression
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
