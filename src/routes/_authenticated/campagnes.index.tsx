import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarRange, ListChecks, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCampaigns } from "@/lib/queries";
import { campaignStatus, formatDate, frenchError, type CampaignStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/campagnes/")({
  head: () => ({
    meta: [
      { title: "Campagnes — ICORP Terrain" },
      { name: "description", content: "Gestion des campagnes de saisie ICORP." },
      { property: "og:title", content: "Campagnes — ICORP Terrain" },
      { property: "og:description", content: "Création, ouverture et clôture des campagnes." },
    ],
  }),
  component: CampaignsPage,
});

const STATUS_STYLE: Record<CampaignStatus, string> = {
  "À venir": "bg-muted text-muted-foreground",
  Ouverte: "bg-success/15 text-success",
  Clôturée: "bg-destructive/10 text-destructive",
  Rouverte: "bg-accent/25 text-accent-foreground",
};

type C = { id: string; name: string; description: string | null; start_date: string; end_date: string; reopened: boolean };

function CampaignsPage() {
  const { data, isLoading } = useCampaigns();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<C> | null>(null);
  const [toggle, setToggle] = useState<C | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!edit) return;
    if (!edit.name?.trim() || !edit.start_date || !edit.end_date) return void toast.error("Nom et dates obligatoires.");
    if (edit.end_date < edit.start_date) return void toast.error("La date de fin doit suivre la date de début.");
    setSaving(true);
    const payload = { name: edit.name.trim(), description: edit.description ?? null, start_date: edit.start_date, end_date: edit.end_date };
    const { error } = edit.id
      ? await supabase.from("campaigns").update(payload).eq("id", edit.id)
      : await supabase.from("campaigns").insert(payload);
    setSaving(false);
    if (error) return void toast.error(frenchError(error.message));
    toast.success(edit.id ? "Campagne modifiée" : "Campagne créée");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  }

  async function doToggle() {
    if (!toggle) return;
    const { error } = await supabase.from("campaigns").update({ reopened: !toggle.reopened }).eq("id", toggle.id);
    if (error) return void toast.error(frenchError(error.message));
    toast.success(toggle.reopened ? "Campagne clôturée" : "Campagne rouverte");
    setToggle(null);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  }

  return (
    <div>
      <PageHeader
        title="Campagnes"
        action={<Button className="h-11" onClick={() => setEdit({})}><Plus className="size-4" /> Nouvelle campagne</Button>}
      />
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={CalendarRange} title="Aucune campagne" description="Créez votre première campagne de saisie." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(data ?? []).map((c) => {
            const st = campaignStatus(c);
            const pastEnd = new Date().toISOString().slice(0, 10) > c.end_date;
            return (
              <div key={c.id} className="card-surface p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-semibold">{c.name}</p>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[st])}>{st}</span>
                </div>
                {c.description ? <p className="mt-1 text-sm text-muted-foreground">{c.description}</p> : null}
                <p className="mt-2 text-sm">Du {formatDate(c.start_date)} au {formatDate(c.end_date)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="default" className="h-11">
                    <Link to="/campagnes/$campaignId" params={{ campaignId: c.id }}><ListChecks className="size-4" /> Formulaire</Link>
                  </Button>
                  <Button variant="outline" className="h-11" onClick={() => setEdit(c)}><Pencil className="size-4" /> Modifier</Button>
                  {pastEnd || c.reopened ? (
                    <Button variant="outline" className="h-11" onClick={() => setToggle(c)}>
                      {c.reopened ? "Clôturer" : "Rouvrir"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Modifier la campagne" : "Nouvelle campagne"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nom</Label><Input className="h-11" value={edit?.name ?? ""} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={edit?.description ?? ""} onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Début</Label><Input type="date" className="h-11" value={edit?.start_date ?? ""} onChange={(e) => setEdit((s) => ({ ...s, start_date: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Fin</Label><Input type="date" className="h-11" value={edit?.end_date ?? ""} onChange={(e) => setEdit((s) => ({ ...s, end_date: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setEdit(null)}>Annuler</Button>
            <Button className="h-11" disabled={saving} onClick={save}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(toggle)} onOpenChange={(o) => !o && setToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggle?.reopened ? "Clôturer la campagne ?" : "Rouvrir la campagne ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggle?.reopened ? "Les zones ne pourront plus saisir de fiches." : "Les zones pourront de nouveau saisir des fiches."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={doToggle}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
