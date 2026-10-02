import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initializationAvailable, logLoginAttempt } from "@/lib/admin.functions";
import { frenchError } from "@/lib/format";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion — ICORP Terrain" },
      {
        name: "description",
        content: "Connexion à ICORP Terrain, la plateforme interne des opérations de terrain d'ICORP.",
      },
      { property: "og:title", content: "Connexion — ICORP Terrain" },
      {
        property: "og:description",
        content: "Accès réservé aux comptes ICORP : administrateurs, supervision et zones.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const logAttempt = useServerFn(logLoginAttempt);
  const checkInit = useServerFn(initializationAvailable);

  const { data: init } = useQuery({
    queryKey: ["initialisation-available"],
    queryFn: () => checkInit({}),
  });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/tableau-de-bord", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    void logAttempt({
      data: {
        email: email.trim(),
        success: !error,
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 500),
      },
    }).catch(() => undefined);

    if (error) {
      setLoading(false);
      toast.error(frenchError(error.message));
      return;
    }
    toast.success("Connexion réussie");
    navigate({ to: "/tableau-de-bord", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={logoAsset.url}
            alt="Intelligentsia Corporation — Il suffit d'y croire !"
            className="-my-6 h-48 w-48 object-contain"
          />
          <h1 className="mt-2 text-2xl font-bold tracking-tight">ICORP Terrain</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plateforme interne — année scolaire 2026-2027
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="card-surface space-y-5 p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
              placeholder="nom@icorp.cm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base"
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={loading} className="h-12 w-full text-base">
            {loading ? <Loader2 className="size-5 animate-spin" /> : <LockKeyhole className="size-5" />}
            Se connecter
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Les comptes sont créés par l'administrateur principal. Aucune inscription libre.
          </p>
          {init?.available ? (
            <Link
              to="/initialisation"
              className="block text-center text-sm font-medium text-primary underline"
            >
              Initialiser le premier compte administrateur
            </Link>
          ) : null}
        </form>
      </div>
    </div>
  );
}
