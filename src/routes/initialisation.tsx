import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createFirstAdmin, initializationAvailable } from "@/lib/admin.functions";
import { frenchError } from "@/lib/format";

export const Route = createFileRoute("/initialisation")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Initialisation — ICORP Terrain" },
      {
        name: "description",
        content: "Création du premier compte administrateur principal d'ICORP Terrain.",
      },
      { property: "og:title", content: "Initialisation — ICORP Terrain" },
      {
        property: "og:description",
        content: "Étape unique de création du compte administrateur principal.",
      },
    ],
  }),
  component: InitPage,
});

function InitPage() {
  const navigate = useNavigate();
  const checkInit = useServerFn(initializationAvailable);
  const create = useServerFn(createFirstAdmin);
  const [accountName, setAccountName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["initialisation-available"],
    queryFn: () => checkInit({}),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!data?.available) {
    navigate({ to: "/", replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (password.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setLoading(true);
    try {
      await create({ data: { email: email.trim(), password, accountName: accountName.trim() } });
      toast.success("Compte administrateur principal créé. Vous pouvez vous connecter.");
      navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(frenchError(error instanceof Error ? error.message : null));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <form onSubmit={handleSubmit} className="card-surface w-full max-w-md space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold">Initialisation</h1>
            <p className="text-sm text-muted-foreground">
              Création du premier administrateur principal
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="accountName">Nom du compte</Label>
          <Input
            id="accountName"
            required
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="h-12 text-base"
            placeholder="Administration ICORP"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Adresse email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe (8 caractères minimum)</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 text-base"
          />
        </div>
        <Button type="submit" disabled={loading} className="h-12 w-full text-base">
          {loading ? <Loader2 className="size-5 animate-spin" /> : null}
          Créer le compte
        </Button>
      </form>
    </div>
  );
}
