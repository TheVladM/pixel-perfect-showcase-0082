import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Package, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { frenchError } from "@/lib/format";
import { useProducts } from "@/lib/orders";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/catalogue")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Catalogue produits — ICORP Terrain" },
      { name: "description", content: "Gestion du catalogue de produits commandables." },
      { property: "og:title", content: "Catalogue produits — ICORP Terrain" },
      { property: "og:description", content: "Gestion du catalogue de produits commandables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCatalog,
});

type Draft = { id?: string; name: string; unit: string; description: string };

function AdminCatalog() {
  const { data, isLoading } = useProducts(false);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["products"] });

  async function toggle(id: string, value: boolean) {
    const { error } = await supabase.from("products").update({ is_available: value }).eq("id", id);
    if (error) return void toast.error(frenchError(error.message));
    void refresh();
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.unit.trim()) return void toast.error("Le nom et l'unité sont obligatoires.");
    setSaving(true);
    const payload = { name: draft.name.trim(), unit: draft.unit.trim(), description: draft.description.trim() || null };
    const { error } = draft.id
      ? await supabase.from("products").update(payload).eq("id", draft.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return void toast.error(frenchError(error.message));
    toast.success(draft.id ? "Produit modifié." : "Produit créé (non disponible par défaut).");
    setDraft(null);
    void refresh();
  }

  return (
    <div>
      <PageHeader
        title="Catalogue"
        description="Seuls les produits disponibles sont visibles par les zones."
        action={
          <Button className="h-11" onClick={() => setDraft({ name: "", unit: "", description: "" })}>
            <Plus className="size-4" /> Nouveau produit
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !data?.length ? (
        <EmptyState icon={Package} title="Aucun produit" description="Ajoutez votre premier produit." />
      ) : (
        <div className="card-surface divide-y divide-border">
          {data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  Unité : {p.unit}
                  {p.description ? ` · ${p.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={p.is_available} onCheckedChange={(v) => toggle(p.id, v)} />
                  {p.is_available ? "Disponible" : "Indisponible"}
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Modifier"
                  onClick={() => setDraft({ id: p.id, name: p.name, unit: p.unit, description: p.description ?? "" })}
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pname">Nom *</Label>
                <Input id="pname" className="h-11" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="punit">Unité * (ex. unité, rame, carton)</Label>
                <Input id="punit" className="h-11" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdesc">Description</Label>
                <Textarea id="pdesc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
