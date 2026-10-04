import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, Power, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { RoleBadge } from "@/components/RoleBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createAccount, resetAccountPassword, setAccountActive } from "@/lib/admin.functions";
import { useAccounts, type Account } from "@/lib/accounts";
import { formatDate, frenchError } from "@/lib/format";
import { useRegions, useZones } from "@/lib/queries";
import { requireRole } from "@/lib/route-guards";
import { ROLE_LABELS, useMe, type AppRole } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/comptes")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["admin_principal"]),
  head: () => ({
    meta: [
      { title: "Comptes — ICORP Terrain" },
      { name: "description", content: "Gestion des comptes utilisateurs ICORP Terrain." },
      { property: "og:title", content: "Comptes — ICORP Terrain" },
      {
        property: "og:description",
        content: "Création, réinitialisation et désactivation des comptes.",
      },
    ],
  }),
  component: AccountsPage,
});

const ALL = "all";
const ROLES = Object.keys(ROLE_LABELS) as AppRole[];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Draft = {
  email: string;
  password: string;
  accountName: string;
  role: AppRole | "";
  regionId: string;
  zoneId: string;
};

const EMPTY_DRAFT: Draft = {
  email: "",
  password: "",
  accountName: "",
  role: "",
  regionId: "",
  zoneId: "",
};

function errorMessage(error: unknown): string {
  return frenchError(error instanceof Error ? error.message : null);
}

function AccountsPage() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useAccounts();
  const { data: regions } = useRegions();
  const { data: zones } = useZones();
  const queryClient = useQueryClient();
  const create = useServerFn(createAccount);
  const resetPassword = useServerFn(resetAccountPassword);
  const setActive = useServerFn(setAccountActive);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [resetFor, setResetFor] = useState<Account | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [toDeactivate, setToDeactivate] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  const zoneById = useMemo(() => new Map((zones ?? []).map((z) => [z.id, z])), [zones]);
  const regionById = useMemo(() => new Map((regions ?? []).map((r) => [r.id, r])), [regions]);

  function location(a: Account): string {
    if (a.zoneId) {
      const z = zoneById.get(a.zoneId);
      return z ? `Zone ${z.name} (${z.code})` : "Zone inconnue";
    }
    if (a.regionId) return `Région ${regionById.get(a.regionId)?.name ?? "inconnue"}`;
    return "—";
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        (roleFilter === ALL || a.role === roleFilter) &&
        (!s || a.accountName.toLowerCase().includes(s) || a.email.toLowerCase().includes(s)),
    );
  }, [data, search, roleFilter]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["accounts"] });

  async function submitCreate() {
    if (!draft) return;
    const email = draft.email.trim();
    const accountName = draft.accountName.trim();
    if (!EMAIL_RE.test(email)) return void toast.error("Adresse email invalide.");
    if (draft.password.length < 8)
      return void toast.error("Le mot de passe doit contenir au moins 8 caractères.");
    if (accountName.length < 2)
      return void toast.error("Le nom du compte doit contenir au moins 2 caractères.");
    if (!draft.role) return void toast.error("Le rôle est obligatoire.");
    if (draft.role === "superviseur" && !draft.regionId)
      return void toast.error("La région est obligatoire pour un superviseur.");
    if (draft.role === "zone" && !draft.zoneId)
      return void toast.error("La zone est obligatoire pour un compte zone.");
    setBusy(true);
    try {
      await create({
        data: {
          email,
          password: draft.password,
          accountName,
          role: draft.role,
          regionId: draft.role === "superviseur" ? draft.regionId : null,
          zoneId: draft.role === "zone" ? draft.zoneId : null,
        },
      });
      toast.success(`Compte « ${accountName} » créé.`);
      setDraft(null);
      void refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openReset(a: Account) {
    setResetFor(a);
    setNewPassword("");
    setConfirmPassword("");
  }

  async function submitReset() {
    if (!resetFor) return;
    if (newPassword.length < 8)
      return void toast.error("Le mot de passe doit contenir au moins 8 caractères.");
    if (newPassword !== confirmPassword)
      return void toast.error("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    try {
      await resetPassword({ data: { userId: resetFor.id, password: newPassword } });
      toast.success(`Mot de passe de « ${resetFor.accountName} » réinitialisé.`);
      setResetFor(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeActive(a: Account, active: boolean) {
    setBusy(true);
    try {
      await setActive({ data: { userId: a.id, active } });
      toast.success(
        active ? `Compte « ${a.accountName} » réactivé.` : `Compte « ${a.accountName} » désactivé.`,
      );
      setToDeactivate(null);
      void refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function actions(a: Account) {
    const isSelf = a.id === me?.userId;
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" onClick={() => openReset(a)}>
          <KeyRound className="size-4" /> Mot de passe
        </Button>
        {a.isActive ? (
          <Button
            variant="outline"
            className="h-11 text-destructive hover:text-destructive"
            disabled={isSelf}
            title={isSelf ? "Vous ne pouvez pas désactiver votre propre compte." : undefined}
            onClick={() => setToDeactivate(a)}
          >
            <Power className="size-4" /> Désactiver
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => changeActive(a, true)}
          >
            <Power className="size-4" /> Réactiver
          </Button>
        )}
      </div>
    );
  }

  const statusBadge = (active: boolean) => (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        active ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      {active ? "Actif" : "Désactivé"}
    </span>
  );

  return (
    <div>
      <PageHeader
        title="Comptes"
        description={`${filtered.length} compte(s)`}
        action={
          <Button className="h-11" onClick={() => setDraft(EMPTY_DRAFT)}>
            <Plus className="size-4" /> Nouveau compte
          </Button>
        }
      />

      <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un nom ou un email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les rôles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={Users}
          title="Accès non autorisé"
          description={frenchError((error as Error).message)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun compte"
          description="Aucun compte ne correspond à vos critères."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card-surface hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Compte</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Zone / région</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.accountName}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Créé le {formatDate(a.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={a.role} />
                    </td>
                    <td className="px-4 py-3">{location(a)}</td>
                    <td className="px-4 py-3">{statusBadge(a.isActive)}</td>
                    <td className="px-4 py-3">{actions(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((a) => (
              <div key={a.id} className="card-surface space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.accountName}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                  </div>
                  {statusBadge(a.isActive)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge role={a.role} />
                  <span className="text-xs text-muted-foreground">{location(a)}</span>
                </div>
                {actions(a)}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create account */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && !busy && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau compte</DialogTitle>
            <DialogDescription>Le compte pourra se connecter immédiatement.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="acc-name">Nom du compte *</Label>
                <Input
                  id="acc-name"
                  className="h-11"
                  value={draft.accountName}
                  onChange={(e) => setDraft({ ...draft, accountName: e.target.value })}
                  placeholder="ex. Zone Yaoundé 1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-email">Adresse email *</Label>
                <Input
                  id="acc-email"
                  type="email"
                  autoComplete="off"
                  className="h-11"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-password">Mot de passe * (8 caractères minimum)</Label>
                <Input
                  id="acc-password"
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rôle *</Label>
                <Select
                  value={draft.role}
                  onValueChange={(v) =>
                    setDraft({ ...draft, role: v as AppRole, regionId: "", zoneId: "" })
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Choisir un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draft.role === "superviseur" ? (
                <div className="space-y-1.5">
                  <Label>Région *</Label>
                  <Select
                    value={draft.regionId}
                    onValueChange={(v) => setDraft({ ...draft, regionId: v })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Choisir une région" />
                    </SelectTrigger>
                    <SelectContent>
                      {(regions ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {draft.role === "zone" ? (
                <div className="space-y-1.5">
                  <Label>Zone *</Label>
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
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Annuler
            </Button>
            <Button className="h-11" disabled={busy} onClick={submitCreate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Créer le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && !busy && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Nouveau mot de passe pour « {resetFor?.accountName} ». Communiquez-le à la personne
              par un canal sûr.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">Nouveau mot de passe * (8 caractères minimum)</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                className="h-11"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm">Confirmer le mot de passe *</Label>
              <Input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                className="h-11"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => setResetFor(null)}
            >
              Annuler
            </Button>
            <Button className="h-11" disabled={busy} onClick={submitReset}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivation confirmation */}
      <AlertDialog open={!!toDeactivate} onOpenChange={(o) => !o && !busy && setToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toDeactivate?.accountName} » ne pourra plus se connecter ni consulter de données.
              Vous pourrez le réactiver à tout moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDeactivate) void changeActive(toDeactivate, false);
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
