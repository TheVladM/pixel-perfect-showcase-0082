import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/lib/accounts";
import { formatDateTime, frenchError } from "@/lib/format";
import { requireRole } from "@/lib/route-guards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal-connexion")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Journal de connexion — ICORP Terrain" },
      { name: "description", content: "Historique des tentatives de connexion." },
      { property: "og:title", content: "Journal de connexion — ICORP Terrain" },
      { property: "og:description", content: "Consultation du journal de connexion." },
    ],
  }),
  component: LoginLogPage,
});

const ALL = "all";
const PAGE = 25;

const startOfDay = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const endOfDay = (d: string) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + 1);
  return x.toISOString();
};
/** Escapes LIKE wildcards so the search is literal. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function shortAgent(ua: string | null): string {
  if (!ua) return "Appareil inconnu";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navigateur";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "système inconnu";
  return `${browser} · ${os}`;
}

function LoginLogPage() {
  const { data: accounts } = useAccounts();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const search = email.trim().toLowerCase();
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["login_logs", search, result, from, to, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("login_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (search) q = q.ilike("email", `%${likeLiteral(search)}%`);
      if (result !== ALL) q = q.eq("success", result === "success");
      if (from) q = q.gte("created_at", startOfDay(from));
      if (to) q = q.lt("created_at", endOfDay(to));
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  const nameById = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a.accountName])),
    [accounts],
  );
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));

  return (
    <div>
      <PageHeader
        title="Journal de connexion"
        description={`${data?.count ?? 0} tentative(s). Consultation uniquement.`}
      />

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="login-email" className="text-xs text-muted-foreground">
            Compte (email)
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-email"
              placeholder="Rechercher un email…"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setPage(0);
              }}
              className="h-11 pl-9"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Résultat</Label>
          <Select
            value={result}
            onValueChange={(v) => {
              setResult(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les résultats</SelectItem>
              <SelectItem value="success">Réussies</SelectItem>
              <SelectItem value="failure">Échouées</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="login-from" className="text-xs text-muted-foreground">
            Du
          </Label>
          <Input
            id="login-from"
            type="date"
            className="h-11"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="login-to" className="text-xs text-muted-foreground">
            Au
          </Label>
          <Input
            id="login-to"
            type="date"
            className="h-11"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
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
          icon={ScrollText}
          title="Accès non autorisé"
          description={frenchError((error as Error).message)}
        />
      ) : !data?.rows.length ? (
        <EmptyState
          icon={ScrollText}
          title="Aucune tentative"
          description="Aucune tentative de connexion ne correspond à vos critères."
        />
      ) : (
        <>
          <div className={cn("card-surface divide-y divide-border", isFetching && "opacity-60")}>
            {data.rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.email || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.profile_id
                      ? (nameById.get(r.profile_id) ?? "Compte inconnu")
                      : "Aucun compte associé"}{" "}
                    · {shortAgent(r.user_agent)} · {formatDateTime(r.created_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    r.success ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
                  )}
                >
                  {r.success ? "Réussie" : "Échouée"}
                </span>
              </div>
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
    </div>
  );
}
