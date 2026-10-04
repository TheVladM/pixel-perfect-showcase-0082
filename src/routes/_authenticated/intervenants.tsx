import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookUser, Pencil, Plus } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { frenchError } from "@/lib/format";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/intervenants")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Intervenants — ICORP Terrain" },
      { name: "description", content: "Liste des intervenants ICORP." },
      { property: "og:title", content: "Intervenants — ICORP Terrain" },
      { property: "og:description", content: "Liste, ajout et modification des intervenants." },
    ],
  }),
  component: SpeakersPage,
});

type Draft = { id?: string; name: string; roleTitle: string };

function SpeakersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["speakers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("speakers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return void toast.error("Le nom est obligatoire.");
    setSaving(true);
    const payload = { name, role_title: draft.roleTitle.trim() || null };
    const { error } = draft.id
      ? await supabase.from("speakers").update(payload).eq("id", draft.id)
      : await supabase.from("speakers").insert(payload);
    setSaving(false);
    if (error) return void toast.error(frenchError(error.message));
    toast.success(draft.id ? "Intervenant modifié." : "Intervenant ajouté.");
    setDraft(null);
    void queryClient.invalidateQueries({ queryKey: ["speakers"] });
  }

  return (
    <div>
      <PageHeader
        title="Intervenants"
        description={`${data?.length ?? 0} intervenant(s)`}
        action={
          <Button className="h-11" onClick={() => setDraft({ name: "", roleTitle: "" })}>
            <Plus className="size-4" /> Nouvel intervenant
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !data?.length ? (
        <EmptyState
          icon={BookUser}
          title="Aucun intervenant"
          description="Ajoutez votre premier intervenant."
        />
      ) : (
        <div className="card-surface divide-y divide-border">
          {data.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.role_title || "Fonction non renseignée"}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Modifier"
                onClick={() => setDraft({ id: s.id, name: s.name, roleTitle: s.role_title ?? "" })}
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Modifier l'intervenant" : "Nouvel intervenant"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="spname">Nom *</Label>
                <Input
                  id="spname"
                  className="h-11"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sprole">Fonction</Label>
                <Input
                  id="sprole"
                  className="h-11"
                  value={draft.roleTitle}
                  onChange={(e) => setDraft({ ...draft, roleTitle: e.target.value })}
                  placeholder="ex. Conseiller d'orientation"
                />
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
    </div>
  );
}
