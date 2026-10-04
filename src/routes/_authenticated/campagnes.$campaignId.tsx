import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { CustomFieldInput } from "@/components/CustomFieldInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormFields } from "@/lib/queries";
import { frenchError } from "@/lib/format";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/campagnes/$campaignId")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Formulaire de campagne — ICORP Terrain" },
      { name: "description", content: "Construction du formulaire de saisie d'une campagne." },
      { property: "og:title", content: "Formulaire de campagne — ICORP Terrain" },
      { property: "og:description", content: "Champs personnalisés et aperçu mobile." },
    ],
  }),
  component: FormBuilder,
});

const TYPES: Record<string, string> = { text: "Texte", number: "Nombre", date: "Date", phone: "Téléphone", select: "Liste de choix" };
const BASE = ["Nom", "Prénom", "Sexe", "Établissement", "Classe", "Série"];

function FormBuilder() {
  const { campaignId } = Route.useParams();
  const qc = useQueryClient();
  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle()).data,
  });
  const { data: fields, isLoading } = useFormFields(campaignId);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [toDeactivate, setToDeactivate] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["form_fields", campaignId] });
  const list = fields ?? [];

  async function add() {
    if (!label.trim()) return void toast.error("Le libellé est obligatoire.");
    const opts = type === "select" ? options.split(/\n|,/).map((o) => o.trim()).filter(Boolean) : [];
    if (type === "select" && opts.length < 2) return void toast.error("Indiquez au moins deux options.");
    const max = list.reduce((m, f) => Math.max(m, f.sort_order), 0);
    const { error } = await supabase.from("form_fields").insert({
      campaign_id: campaignId, label: label.trim(), field_type: type, required, options: opts, sort_order: max + 1,
    });
    if (error) return void toast.error(frenchError(error.message));
    toast.success("Champ ajouté");
    setLabel(""); setOptions(""); setRequired(false); setType("text");
    refresh();
  }

  async function move(index: number, dir: -1 | 1) {
    const a = list[index], b = list[index + dir];
    if (!a || !b) return;
    const r1 = await supabase.from("form_fields").update({ sort_order: b.sort_order }).eq("id", a.id);
    const r2 = await supabase.from("form_fields").update({ sort_order: a.sort_order }).eq("id", b.id);
    if (r1.error || r2.error) return void toast.error(frenchError((r1.error ?? r2.error)?.message));
    if (a.sort_order === b.sort_order) {
      await supabase.from("form_fields").update({ sort_order: a.sort_order + dir }).eq("id", a.id);
    }
    refresh();
  }

  async function setActive(id: string, active: boolean) {
    const { error } = await supabase.from("form_fields").update({ is_active: active }).eq("id", id);
    if (error) return void toast.error(frenchError(error.message));
    toast.success(active ? "Champ réactivé" : "Champ désactivé");
    setToDeactivate(null);
    refresh();
  }

  return (
    <div>
      <Link to="/campagnes" className="mb-2 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Campagnes
      </Link>
      <PageHeader title={campaign.data?.name ?? "Formulaire"} description="Champs de la fiche élève" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="card-surface p-4">
            <p className="mb-3 text-sm font-semibold">Champs de base (verrouillés)</p>
            <div className="flex flex-wrap gap-2">
              {BASE.map((b) => (
                <span key={b} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-sm">
                  <Lock className="size-3" /> {b}
                </span>
              ))}
            </div>
          </div>

          <div className="card-surface p-4">
            <p className="mb-3 text-sm font-semibold">Champs personnalisés</p>
            {isLoading ? <Skeleton className="h-24 w-full" /> : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun champ personnalisé pour l'instant.</p>
            ) : (
              <ul className="space-y-2">
                {list.map((f, i) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <div className={f.is_active ? "" : "opacity-50"}>
                      <p className="font-medium">{f.label}{f.required ? " *" : ""}</p>
                      <p className="text-xs text-muted-foreground">{TYPES[f.field_type]}{f.is_active ? "" : " · désactivé"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="size-11" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp className="size-4" /></Button>
                      <Button size="icon" variant="ghost" className="size-11" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown className="size-4" /></Button>
                      {f.is_active ? (
                        <Button variant="outline" className="h-11" onClick={() => setToDeactivate(f.id)}>Désactiver</Button>
                      ) : (
                        <Button variant="outline" className="h-11" onClick={() => setActive(f.id, true)}>Réactiver</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card-surface space-y-3 p-4">
            <p className="text-sm font-semibold">Ajouter un champ</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Libellé</Label><Input className="h-11" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {type === "select" ? (
              <div className="space-y-2"><Label>Options (une par ligne ou séparées par des virgules)</Label><Input className="h-11" value={options} onChange={(e) => setOptions(e.target.value)} /></div>
            ) : null}
            <label className="flex min-h-11 items-center gap-3 text-sm"><Switch checked={required} onCheckedChange={setRequired} /> Obligatoire</label>
            <Button className="h-11" onClick={add}><Plus className="size-4" /> Ajouter</Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Aperçu sur téléphone</p>
          <div className="mx-auto w-[320px] rounded-[2rem] border-8 border-foreground/80 bg-background p-4 shadow-[var(--shadow-float)]">
            <div className="max-h-[560px] space-y-3 overflow-y-auto">
              {["Établissement", "Classe", "Nom", "Prénom"].map((b) => (
                <div key={b} className="space-y-1"><Label className="text-xs">{b} *</Label><Input disabled className="h-11" /></div>
              ))}
              <div className="space-y-1">
                <Label className="text-xs">Sexe *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex h-11 items-center justify-center rounded-xl border-2 border-border text-sm">Masculin</div>
                  <div className="flex h-11 items-center justify-center rounded-xl border-2 border-border text-sm">Féminin</div>
                </div>
              </div>
              {list.filter((f) => f.is_active).map((f) => (
                <div key={f.id} className="space-y-1">
                  <Label className="text-xs">{f.label}{f.required ? " *" : ""}</Label>
                  <CustomFieldInput field={f} value="" onChange={() => undefined} />
                </div>
              ))}
              <Button disabled className="h-11 w-full">Enregistrer</Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={Boolean(toDeactivate)} onOpenChange={(o) => !o && setToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce champ ?</AlertDialogTitle>
            <AlertDialogDescription>Il n'apparaîtra plus dans le formulaire. Les fiches déjà saisies ne changent pas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDeactivate && setActive(toDeactivate, false)}>Désactiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
