import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { frenchError } from "@/lib/format";
import { useClasses, useSeries } from "@/lib/queries";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/classes-series")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Classes et séries — ICORP Terrain" },
      { name: "description", content: "Référentiel des classes et des séries." },
      { property: "og:title", content: "Classes et séries — ICORP Terrain" },
      { property: "og:description", content: "Liste et ajout des classes et des séries." },
    ],
  }),
  component: ClassesSeriesPage,
});

type ClassDraft = { label: string; sortOrder: string; requiresSeries: boolean };

function ClassesSeriesPage() {
  const { data: classes, isLoading: classesLoading } = useClasses();
  const { data: series, isLoading: seriesLoading } = useSeries();
  const queryClient = useQueryClient();
  const [classDraft, setClassDraft] = useState<ClassDraft | null>(null);
  const [seriesDraft, setSeriesDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openClass() {
    const next = Math.max(0, ...(classes ?? []).map((c) => c.sort_order)) + 1;
    setClassDraft({ label: "", sortOrder: String(next), requiresSeries: false });
  }

  async function saveClass() {
    if (!classDraft) return;
    const label = classDraft.label.trim();
    const sortOrder = Number(classDraft.sortOrder);
    if (!label) return void toast.error("Le libellé est obligatoire.");
    if (!Number.isInteger(sortOrder) || sortOrder < 0)
      return void toast.error("L'ordre d'affichage doit être un nombre entier positif.");
    setSaving(true);
    const { error } = await supabase
      .from("classes")
      .insert({ label, sort_order: sortOrder, requires_series: classDraft.requiresSeries });
    setSaving(false);
    if (error) return void toast.error(frenchError(error.message));
    toast.success("Classe ajoutée.");
    setClassDraft(null);
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  async function saveSeries() {
    if (seriesDraft === null) return;
    const label = seriesDraft.trim();
    if (!label) return void toast.error("Le libellé est obligatoire.");
    setSaving(true);
    const { error } = await supabase.from("series").insert({ label });
    setSaving(false);
    if (error) return void toast.error(frenchError(error.message));
    toast.success("Série ajoutée.");
    setSeriesDraft(null);
    void queryClient.invalidateQueries({ queryKey: ["series"] });
  }

  return (
    <div>
      <PageHeader
        title="Classes et séries"
        description="Référentiel utilisé dans les fiches élèves."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Classes</h2>
            <Button className="h-11" onClick={openClass}>
              <Plus className="size-4" /> Nouvelle classe
            </Button>
          </div>
          {classesLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : !classes?.length ? (
            <EmptyState icon={GraduationCap} title="Aucune classe" />
          ) : (
            <div className="card-surface divide-y divide-border">
              {classes.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{c.label}</p>
                    <p className="text-xs text-muted-foreground">Ordre {c.sort_order}</p>
                  </div>
                  <span
                    className={
                      c.requires_series
                        ? "rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary"
                        : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {c.requires_series ? "Série obligatoire" : "Sans série"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Séries</h2>
            <Button className="h-11" onClick={() => setSeriesDraft("")}>
              <Plus className="size-4" /> Nouvelle série
            </Button>
          </div>
          {seriesLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : !series?.length ? (
            <EmptyState icon={GraduationCap} title="Aucune série" />
          ) : (
            <div className="card-surface divide-y divide-border">
              {series.map((s) => (
                <div key={s.id} className="p-4">
                  <p className="font-semibold">Série {s.label}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={!!classDraft} onOpenChange={(o) => !o && setClassDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle classe</DialogTitle>
          </DialogHeader>
          {classDraft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="clabel">Libellé * (ex. 2nde)</Label>
                <Input
                  id="clabel"
                  className="h-11"
                  value={classDraft.label}
                  onChange={(e) => setClassDraft({ ...classDraft, label: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="corder">Ordre d'affichage *</Label>
                <Input
                  id="corder"
                  type="number"
                  min={0}
                  step={1}
                  className="h-11"
                  value={classDraft.sortOrder}
                  onChange={(e) => setClassDraft({ ...classDraft, sortOrder: e.target.value })}
                />
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Switch
                  checked={classDraft.requiresSeries}
                  onCheckedChange={(v) => setClassDraft({ ...classDraft, requiresSeries: v })}
                />
                La série est obligatoire pour cette classe
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassDraft(null)}>
              Annuler
            </Button>
            <Button onClick={saveClass} disabled={saving}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={seriesDraft !== null} onOpenChange={(o) => !o && setSeriesDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle série</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="slabel">Libellé * (ex. A, C, D, TI)</Label>
            <Input
              id="slabel"
              className="h-11"
              value={seriesDraft ?? ""}
              onChange={(e) => setSeriesDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeriesDraft(null)}>
              Annuler
            </Button>
            <Button onClick={saveSeries} disabled={saving}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
