import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { RoleBadge } from "@/components/RoleBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useAccounts } from "@/lib/accounts";
import { formatDateTime, frenchError } from "@/lib/format";
import { useRegions, useZones } from "@/lib/queries";
import { requireRole } from "@/lib/route-guards";
import type { AppRole } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal-audit")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Journal d'audit — ICORP Terrain" },
      { name: "description", content: "Historique des modifications de données." },
      { property: "og:title", content: "Journal d'audit — ICORP Terrain" },
      { property: "og:description", content: "Consultation du journal d'audit." },
    ],
  }),
  component: AuditLogPage,
});

const ALL = "all";
const SYSTEM = "system";
const PAGE = 25;

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
  ADMIN_CREATE_ACCOUNT: "Création de compte",
  ADMIN_RESET_PASSWORD: "Réinitialisation du mot de passe",
  ADMIN_DEACTIVATE_ACCOUNT: "Désactivation de compte",
  ADMIN_REACTIVATE_ACCOUNT: "Réactivation de compte",
};

const ACTION_STYLES: Record<string, string> = {
  INSERT: "bg-success/15 text-success",
  UPDATE: "bg-primary-soft text-primary",
  DELETE: "bg-destructive/10 text-destructive",
};

const TABLE_LABELS: Record<string, string> = {
  profiles: "Comptes",
  user_roles: "Rôles",
  "auth.users": "Authentification",
  regions: "Régions",
  zones: "Zones",
  schools: "Établissements",
  classes: "Classes",
  series: "Séries",
  speakers: "Intervenants",
  campaigns: "Campagnes",
  form_fields: "Champs de formulaire",
  student_records: "Fiches élèves",
  products: "Produits",
  orders: "Commandes",
  order_items: "Lignes de commande",
};

const FIELD_LABELS: Record<string, string> = {
  id: "Identifiant",
  account_name: "Nom du compte",
  email: "Email",
  is_active: "Actif",
  region_id: "Région",
  zone_id: "Zone",
  role: "Rôle",
  user_id: "Compte",
  name: "Nom",
  code: "Code",
  label: "Libellé",
  sort_order: "Ordre",
  requires_series: "Série obligatoire",
  role_title: "Fonction",
  description: "Description",
  start_date: "Date de début",
  end_date: "Date de fin",
  reopened: "Rouverte",
  field_type: "Type de champ",
  options: "Options",
  required: "Obligatoire",
  last_name: "Nom",
  first_name: "Prénom",
  sex: "Sexe",
  agent_name: "Agent",
  is_deleted: "Supprimée",
  deletion_reason: "Motif de suppression",
  status: "Statut",
  unit: "Unité",
  is_available: "Disponible",
  order_number: "N° de commande",
  rejection_reason: "Motif de rejet",
  pickup_instructions: "Instructions de retrait",
  requested_quantity: "Quantité demandée",
  retained_quantity: "Quantité retenue",
  password_reset: "Mot de passe réinitialisé",
  created_at: "Créé le",
};

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_role: AppRole | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Json | null;
  new_data: Json | null;
  created_at: string;
};

const startOfDay = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const endOfDay = (d: string) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + 1);
  return x.toISOString();
};

function asObject(v: Json | null): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function AuditLogPage() {
  const { data: accounts } = useAccounts();
  const { data: zones } = useZones();
  const { data: regions } = useRegions();
  const [actor, setActor] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [table, setTable] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["audit_log", actor, action, table, from, to, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (actor === SYSTEM) q = q.is("actor_id", null);
      else if (actor !== ALL) q = q.eq("actor_id", actor);
      if (action !== ALL) q = q.eq("action", action);
      if (table !== ALL) q = q.eq("table_name", table);
      if (from) q = q.gte("created_at", startOfDay(from));
      if (to) q = q.lt("created_at", endOfDay(to));
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data as AuditRow[], count: count ?? 0 };
    },
  });

  const nameById = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a.accountName])),
    [accounts],
  );
  const zoneById = useMemo(() => new Map((zones ?? []).map((z) => [z.id, z])), [zones]);
  const regionById = useMemo(() => new Map((regions ?? []).map((r) => [r.id, r])), [regions]);

  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
    };

  const actorName = (id: string | null) =>
    id ? (nameById.get(id) ?? "Compte inconnu") : "Système / automatique";

  function formatValue(field: string, v: Json | undefined): string {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Oui" : "Non";
    if (typeof v === "string") {
      if (field === "zone_id") {
        const z = zoneById.get(v);
        return z ? `${z.name} (${z.code})` : v;
      }
      if (field === "region_id") return regionById.get(v)?.name ?? v;
      if (["user_id", "created_by", "deleted_by", "decided_by"].includes(field))
        return nameById.get(v) ?? v;
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
      return v;
    }
    if (typeof v === "number") return String(v);
    return JSON.stringify(v, null, 2);
  }

  const diff = useMemo(() => {
    if (!detail) return [];
    const before = asObject(detail.old_data);
    const after = asObject(detail.new_data);
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.map((k) => ({
      key: k,
      before: before[k],
      after: after[k],
      changed: JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
    }));
  }, [detail]);
  const visibleDiff =
    detail?.action === "UPDATE" && !showAll ? diff.filter((d) => d.changed) : diff;

  const tableName = (t: string) => TABLE_LABELS[t] ?? t;
  const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        description={`${data?.count ?? 0} entrée(s). Consultation uniquement.`}
      />

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={actor} onValueChange={resetPage(setActor)}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les comptes</SelectItem>
            <SelectItem value={SYSTEM}>Système / automatique</SelectItem>
            {(accounts ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.accountName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={resetPage(setAction)}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les actions</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={table} onValueChange={resetPage(setTable)}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les données</SelectItem>
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
            Du
          </Label>
          <Input
            id="audit-from"
            type="date"
            className="h-11"
            value={from}
            onChange={(e) => resetPage(setFrom)(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
            Au
          </Label>
          <Input
            id="audit-to"
            type="date"
            className="h-11"
            value={to}
            onChange={(e) => resetPage(setTo)(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={ShieldCheck}
          title="Accès non autorisé"
          description={frenchError((error as Error).message)}
        />
      ) : !data?.rows.length ? (
        <EmptyState
          icon={ShieldCheck}
          title="Aucune entrée"
          description="Aucune entrée ne correspond à vos critères."
        />
      ) : (
        <>
          <div className={cn("card-surface divide-y divide-border", isFetching && "opacity-60")}>
            {data.rows.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setShowAll(false);
                  setDetail(r);
                }}
                className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        ACTION_STYLES[r.action] ?? "bg-accent/25 text-accent-foreground",
                      )}
                    >
                      {actionLabel(r.action)}
                    </span>
                    <span className="text-sm font-medium">{tableName(r.table_name)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {actorName(r.actor_id)} · {formatDateTime(r.created_at)}
                  </p>
                </div>
                {r.actor_role ? <RoleBadge role={r.actor_role} /> : null}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              className="h-11"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} / {pages}
            </span>
            <Button
              variant="outline"
              className="h-11"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {actionLabel(detail.action)} · {tableName(detail.table_name)}
                </DialogTitle>
                <DialogDescription>
                  {actorName(detail.actor_id)} · {formatDateTime(detail.created_at)}
                  {detail.record_id ? ` · enregistrement ${detail.record_id.slice(0, 8)}` : ""}
                </DialogDescription>
              </DialogHeader>
              {detail.action === "UPDATE" ? (
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <Switch checked={showAll} onCheckedChange={setShowAll} />
                  Afficher aussi les champs non modifiés
                </label>
              ) : null}
              {visibleDiff.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune valeur modifiée.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Champ</th>
                        <th className="px-3 py-2">Avant</th>
                        <th className="px-3 py-2">Après</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibleDiff.map((d) => (
                        <tr
                          key={d.key}
                          className={cn(d.changed && detail.action === "UPDATE" && "bg-accent/10")}
                        >
                          <td className="px-3 py-2 align-top font-medium">
                            {FIELD_LABELS[d.key] ?? d.key}
                          </td>
                          <td className="whitespace-pre-wrap break-all px-3 py-2 align-top text-muted-foreground">
                            {formatValue(d.key, d.before)}
                          </td>
                          <td className="whitespace-pre-wrap break-all px-3 py-2 align-top">
                            {formatValue(d.key, d.after)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
