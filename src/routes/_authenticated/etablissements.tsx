import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Building2, Loader2, Pencil, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { frenchError } from "@/lib/format";
import { useZones } from "@/lib/queries";
import { requireRole } from "@/lib/route-guards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/etablissements")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Établissements — ICORP Terrain" },
      { name: "description", content: "Gestion des établissements scolaires par zone." },
      { property: "og:title", content: "Établissements — ICORP Terrain" },
      {
        property: "og:description",
        content: "Liste, ajout, renommage et import des établissements.",
      },
    ],
  }),
  component: SchoolsPage,
});

const ALL = "all";
const PAGE = 25;
const MAX_IMPORT_ROWS = 5000;
const INSERT_CHUNK = 500;

type School = { id: string; name: string; zone_id: string };
type Draft = { id?: string; name: string; zoneId: string };
type ImportRow = {
  line: number;
  name: string;
  zoneCode: string;
  zoneId: string | null;
  error: string | null;
};
type ImportReport = { inserted: number; rejected: ImportRow[]; failures: string[] };

/** Trimmed name with collapsed spaces, as stored. */
const clean = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");
/** Comparison key: duplicates are detected case-insensitively. */
const norm = (s: string) => clean(s).toLocaleLowerCase("fr");
const key = (zoneId: string, name: string) => `${zoneId}|${norm(name)}`;

/** Reads every school (PostgREST caps a single response at 1000 rows). */
async function fetchAllSchools(): Promise<School[]> {
  const out: School[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await supabase
      .from("schools")
      .select("id, name, zone_id")
      .order("name")
      .range(from, from + step - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < step) break;
  }
  return out;
}

function decodeText(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Excel "CSV" exports on Windows are usually Windows-1252.
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
}

/** Minimal RFC 4180 parser; the delimiter (`;`, `,` or tab) is detected on the first line. */
function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", ",", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readTable(file: File): Promise<string[][]> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const first = wb.SheetNames[0];
    const sheet = first ? wb.Sheets[first] : undefined;
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  }
  return parseCsv(decodeText(await file.arrayBuffer()));
}

function SchoolsPage() {
  const { data: zones } = useZones();
  const { data, isLoading, error } = useQuery({
    queryKey: ["schools", "admin-all"],
    queryFn: fetchAllSchools,
  });
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [zone, setZone] = useState(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ fileName: string; rows: ImportRow[] } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);

  const zoneById = useMemo(() => new Map((zones ?? []).map((z) => [z.id, z])), [zones]);
  const zoneByCode = useMemo(
    () => new Map((zones ?? []).map((z) => [z.code.trim().toUpperCase(), z])),
    [zones],
  );
  const existingKeys = useMemo(
    () => new Set((data ?? []).map((s) => key(s.zone_id, s.name))),
    [data],
  );

  const filtered = useMemo(() => {
    const s = norm(search);
    return (data ?? []).filter(
      (r) => (zone === ALL || r.zone_id === zone) && (!s || norm(r.name).includes(s)),
    );
  }, [data, zone, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["schools"] });

  function zoneLabel(zoneId: string) {
    const z = zoneById.get(zoneId);
    return z ? `${z.name} (${z.code})` : "Zone inconnue";
  }

  async function save() {
    if (!draft) return;
    const name = clean(draft.name);
    if (!name) return void toast.error("Le nom est obligatoire.");
    if (!draft.zoneId) return void toast.error("La zone est obligatoire.");
    const duplicate = (data ?? []).some(
      (s) => s.id !== draft.id && s.zone_id === draft.zoneId && norm(s.name) === norm(name),
    );
    if (duplicate) return void toast.error("Un établissement porte déjà ce nom dans cette zone.");
    setSaving(true);
    const { error } = draft.id
      ? await supabase.from("schools").update({ name }).eq("id", draft.id)
      : await supabase.from("schools").insert({ name, zone_id: draft.zoneId });
    setSaving(false);
    if (error) return void toast.error(frenchError(error.message));
    toast.success(draft.id ? "Établissement renommé." : "Établissement ajouté.");
    setDraft(null);
    void refresh();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!zones || !data) return void toast.error("Données en cours de chargement, réessayez.");
    let table: string[][];
    try {
      table = await readTable(file);
    } catch {
      return void toast.error("Impossible de lire ce fichier. Formats acceptés : .csv, .xlsx.");
    }
    const header = (table[0] ?? []).map((h) => String(h).trim().toLowerCase());
    const nameIdx = header.indexOf("name");
    const codeIdx = header.indexOf("zone_code");
    if (nameIdx < 0 || codeIdx < 0) {
      return void toast.error("Colonnes attendues sur la première ligne : name et zone_code.");
    }
    const body = table
      .slice(1)
      .map((cells, i) => ({ cells, line: i + 2 }))
      .filter(({ cells }) => cells.some((c) => String(c ?? "").trim() !== ""));
    if (body.length === 0) return void toast.error("Le fichier ne contient aucune ligne.");
    if (body.length > MAX_IMPORT_ROWS) {
      return void toast.error(`Le fichier dépasse ${MAX_IMPORT_ROWS} lignes. Découpez-le.`);
    }

    const seen = new Set<string>();
    const rows: ImportRow[] = body.map(({ cells, line }) => {
      const name = clean(String(cells[nameIdx] ?? ""));
      const zoneCode = String(cells[codeIdx] ?? "").trim();
      const z = zoneByCode.get(zoneCode.toUpperCase());
      let err: string | null = null;
      if (!name) err = "Nom vide";
      else if (!zoneCode) err = "Code zone vide";
      else if (!z) err = "Code zone inconnu";
      else if (existingKeys.has(key(z.id, name))) err = "Doublon : existe déjà dans la zone";
      else if (seen.has(key(z.id, name))) err = "Doublon dans le fichier (même zone)";
      if (!err && z) seen.add(key(z.id, name));
      return { line, name, zoneCode, zoneId: z?.id ?? null, error: err };
    });
    setReport(null);
    setPreview({ fileName: file.name, rows });
  }

  async function runImport() {
    if (!preview) return;
    const valid = preview.rows.filter((r) => !r.error && r.zoneId);
    const rejected = preview.rows.filter((r) => r.error);
    setImporting(true);
    let inserted = 0;
    const failures: string[] = [];
    for (let i = 0; i < valid.length; i += INSERT_CHUNK) {
      const chunk = valid.slice(i, i + INSERT_CHUNK);
      const { error } = await supabase
        .from("schools")
        .insert(chunk.map((r) => ({ name: r.name, zone_id: r.zoneId! })));
      if (error) {
        const first = chunk[0]?.line;
        const last = chunk[chunk.length - 1]?.line;
        failures.push(`Lignes ${first} à ${last} non importées : ${frenchError(error.message)}`);
      } else inserted += chunk.length;
    }
    setImporting(false);
    setPreview(null);
    setReport({ inserted, rejected, failures });
    if (inserted > 0) void refresh();
  }

  const validCount = preview?.rows.filter((r) => !r.error).length ?? 0;
  const rejectedCount = (preview?.rows.length ?? 0) - validCount;

  return (
    <div>
      <PageHeader
        title="Établissements"
        description={`${filtered.length} établissement(s)`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={() => fileInput.current?.click()}>
              <Upload className="size-4" /> Importer
            </Button>
            <Button
              className="h-11"
              onClick={() => setDraft({ name: "", zoneId: zone === ALL ? "" : zone })}
            >
              <Plus className="size-4" /> Nouvel établissement
            </Button>
          </div>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        className="hidden"
        onChange={onFile}
      />

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un établissement…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-11 pl-9"
          />
        </div>
        <Select
          value={zone}
          onValueChange={(v) => {
            setZone(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les zones</SelectItem>
            {(zones ?? []).map((z) => (
              <SelectItem key={z.id} value={z.id}>
                {z.name} ({z.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={Building2}
          title="Accès non autorisé"
          description={frenchError((error as Error).message)}
        />
      ) : current.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun établissement"
          description="Aucun établissement ne correspond à vos critères."
        />
      ) : (
        <>
          <div className="card-surface divide-y divide-border">
            {current.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {zoneLabel(s.zone_id)}
                    {zoneById.get(s.zone_id)?.regions?.name
                      ? ` · ${zoneById.get(s.zone_id)?.regions?.name}`
                      : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Renommer"
                  onClick={() => setDraft({ id: s.id, name: s.name, zoneId: s.zone_id })}
                >
                  <Pencil className="size-4" />
                </Button>
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

      {/* Add / rename */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Renommer l'établissement" : "Nouvel établissement"}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sname">Nom *</Label>
                <Input
                  id="sname"
                  className="h-11"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Zone *</Label>
                {draft.id ? (
                  <p className="text-sm">{zoneLabel(draft.zoneId)}</p>
                ) : (
                  <Select
                    value={draft.zoneId}
                    onValueChange={(v) => setDraft({ ...draft, zoneId: v })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Choisir une zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {(zones ?? []).map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.name} ({z.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import preview */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && !importing && setPreview(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aperçu de l'import</DialogTitle>
            <DialogDescription>
              {preview?.fileName} : {validCount} ligne(s) à importer, {rejectedCount} ligne(s)
              rejetée(s). Rien n'est enregistré avant confirmation.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-border bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Ligne</th>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Code zone</th>
                  <th className="px-3 py-2">Résultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(preview?.rows ?? []).map((r) => (
                  <tr key={r.line} className={cn(r.error && "bg-destructive/5")}>
                    <td className="px-3 py-2 text-muted-foreground">{r.line}</td>
                    <td className="px-3 py-2">{r.name || "—"}</td>
                    <td className="px-3 py-2">{r.zoneCode || "—"}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-xs font-medium",
                        r.error ? "text-destructive" : "text-success",
                      )}
                    >
                      {r.error ?? (r.zoneId ? `OK · ${zoneLabel(r.zoneId)}` : "OK")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              disabled={importing}
              onClick={() => setPreview(null)}
            >
              Annuler
            </Button>
            <Button className="h-11" disabled={importing || validCount === 0} onClick={runImport}>
              {importing ? <Loader2 className="size-4 animate-spin" /> : null}
              Importer {validCount} établissement(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import report */}
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rapport d'import</DialogTitle>
            <DialogDescription>
              {report?.inserted ?? 0} établissement(s) importé(s), {report?.rejected.length ?? 0}{" "}
              ligne(s) rejetée(s).
            </DialogDescription>
          </DialogHeader>
          {report?.failures.length ? (
            <div className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {report.failures.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </div>
          ) : null}
          {report?.rejected.length ? (
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-border bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Ligne</th>
                    <th className="px-3 py-2">Nom</th>
                    <th className="px-3 py-2">Code zone</th>
                    <th className="px-3 py-2">Motif du rejet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.rejected.map((r) => (
                    <tr key={r.line}>
                      <td className="px-3 py-2 text-muted-foreground">{r.line}</td>
                      <td className="px-3 py-2">{r.name || "—"}</td>
                      <td className="px-3 py-2">{r.zoneCode || "—"}</td>
                      <td className="px-3 py-2 text-xs font-medium text-destructive">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <DialogFooter>
            <Button className="h-11" onClick={() => setReport(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
