import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Info, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CustomFieldInput } from "@/components/CustomFieldInput";
import { SchoolCombobox } from "@/components/SchoolCombobox";
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
import { useClasses, useFormFields, useSchools, useSeries } from "@/lib/queries";
import { frenchError, isCampaignOpen } from "@/lib/format";
import { useMe } from "@/lib/session";
import { cn } from "@/lib/utils";

const AGENT_KEY = "icorp_agent_name";

export const Route = createFileRoute("/_authenticated/saisie/$campaignId")({
  head: () => ({
    meta: [
      { title: "Nouvelle fiche — ICORP Terrain" },
      { name: "description", content: "Saisie d'une fiche élève pour votre zone." },
      { property: "og:title", content: "Nouvelle fiche — ICORP Terrain" },
      { property: "og:description", content: "Formulaire de saisie terrain ICORP." },
    ],
  }),
  component: EntryForm,
});

function EntryForm() {
  const { campaignId } = Route.useParams();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: fields } = useFormFields(campaignId);
  const { data: schools } = useSchools(me?.zoneId);
  const { data: classes } = useClasses();
  const { data: series } = useSeries();

  const [agent, setAgent] = useState("");
  const [agentDialog, setAgentDialog] = useState(false);
  const [agentDraft, setAgentDraft] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [classId, setClassId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const lastNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(AGENT_KEY) ?? "";
    setAgent(stored);
    if (!stored) setAgentDialog(true);
  }, []);

  const activeFields = (fields ?? []).filter((f) => f.is_active);
  const selectedClass = (classes ?? []).find((c) => c.id === classId);
  const needsSeries = Boolean(selectedClass?.requires_series);

  function saveAgent() {
    const name = agentDraft.trim();
    if (!name) {
      toast.error("Le nom de l'agent est obligatoire.");
      return;
    }
    localStorage.setItem(AGENT_KEY, name);
    setAgent(name);
    setAgentDialog(false);
    toast.success(`Agent : ${name}`);
  }

  async function submit(again: boolean) {
    if (saving) return;
    if (!agent) return setAgentDialog(true);
    if (!schoolId) return void toast.error("Choisissez un établissement.");
    if (!classId) return void toast.error("Choisissez une classe.");
    if (needsSeries && !seriesId) return void toast.error("La série est obligatoire pour cette classe.");
    if (!lastName.trim() || !firstName.trim()) return void toast.error("Le nom et le prénom sont obligatoires.");
    if (!sex) return void toast.error("Indiquez le sexe de l'élève.");
    for (const f of activeFields) {
      if (f.required && !(custom[f.id] ?? "").trim()) {
        return void toast.error(`Le champ « ${f.label} » est obligatoire.`);
      }
    }
    setSaving(true);
    const { error } = await supabase.from("student_records").insert({
      campaign_id: campaignId,
      zone_id: me?.zoneId ?? "",
      school_id: schoolId,
      class_id: classId,
      series_id: needsSeries ? seriesId : null,
      last_name: lastName.trim(),
      first_name: firstName.trim(),
      sex,
      custom_values: custom,
      agent_name: agent,
    });
    setSaving(false);
    if (error) {
      toast.error(frenchError(error.message));
      return;
    }
    toast.success(`Fiche enregistrée : ${lastName.trim().toUpperCase()} ${firstName.trim()}`);
    queryClient.invalidateQueries({ queryKey: ["stats_my_zone"] });
    queryClient.invalidateQueries({ queryKey: ["records"] });
    setLastName("");
    setFirstName("");
    setSex("");
    setCustom({});
    if (!again) {
      setSchoolId("");
      setClassId("");
      setSeriesId("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setTimeout(() => lastNameRef.current?.focus(), 50);
    }
  }

  if (campaign.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!campaign.data || !isCampaignOpen(campaign.data)) {
    return (
      <EmptyState
        icon={Info}
        title="Campagne fermée"
        description="Cette campagne n'est pas ouverte à la saisie."
        action={
          <Button asChild variant="outline">
            <Link to="/saisie">Retour</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/saisie" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Mes campagnes
      </Link>
      <h1 className="text-2xl font-bold">{campaign.data.name}</h1>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-primary-soft px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <UserRound className="size-4 text-primary" />
          Agent : <strong>{agent || "—"}</strong>
        </span>
        <button
          className="min-h-11 text-sm font-medium text-primary underline"
          onClick={() => {
            setAgentDraft(agent);
            setAgentDialog(true);
          }}
        >
          Changer d'agent
        </button>
      </div>

      <form
        className="card-surface mt-4 space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <div className="space-y-2">
          <Label>Établissement *</Label>
          <SchoolCombobox schools={schools ?? []} value={schoolId} onChange={setSchoolId} />
          <p className="text-xs text-muted-foreground">
            Établissement absent ? Contactez l'administrateur principal.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Classe *</Label>
            <Select
              value={classId}
              onValueChange={(v) => {
                setClassId(v);
                setSeriesId("");
              }}
            >
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Classe" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsSeries ? (
            <div className="space-y-2">
              <Label>Série *</Label>
              <Select value={seriesId} onValueChange={setSeriesId}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Série" />
                </SelectTrigger>
                <SelectContent>
                  {(series ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ln">Nom *</Label>
          <Input id="ln" ref={lastNameRef} value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-12 text-base" autoCapitalize="characters" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fn">Prénom *</Label>
          <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-12 text-base" />
        </div>
        <div className="space-y-2">
          <Label>Sexe *</Label>
          <div className="grid grid-cols-2 gap-3">
            {(["M", "F"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                className={cn(
                  "h-14 rounded-xl border-2 text-base font-semibold transition-colors",
                  sex === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                )}
              >
                {s === "M" ? "Masculin" : "Féminin"}
              </button>
            ))}
          </div>
        </div>
        {activeFields.map((f) => (
          <div key={f.id} className="space-y-2">
            <Label>
              {f.label}
              {f.required ? " *" : ""}
            </Label>
            <CustomFieldInput field={f} value={custom[f.id] ?? ""} onChange={(v) => setCustom((c) => ({ ...c, [f.id]: v }))} />
          </div>
        ))}
        <div className="flex flex-col gap-3 pt-2">
          <Button type="submit" disabled={saving} className="h-12 text-base">
            {saving ? <Loader2 className="size-5 animate-spin" /> : null}
            Enregistrer
          </Button>
          <Button type="button" variant="outline" disabled={saving} className="h-12 text-base" onClick={() => void submit(true)}>
            Enregistrer et saisir une autre fiche
          </Button>
        </div>
      </form>

      <Dialog open={agentDialog} onOpenChange={(o) => (agent ? setAgentDialog(o) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nom de l'agent</DialogTitle>
            <DialogDescription>
              Indiquez votre nom. Il sera mémorisé sur cet appareil et associé à chaque fiche.
            </DialogDescription>
          </DialogHeader>
          <Input value={agentDraft} onChange={(e) => setAgentDraft(e.target.value)} className="h-12 text-base" placeholder="Prénom et nom" autoFocus />
          <DialogFooter>
            <Button className="h-11" onClick={saveAgent}>
              Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
