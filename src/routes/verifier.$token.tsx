import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CheckCircle2, XCircle } from "lucide-react";
import logoAsset from "@/assets/logo-icorp.webp.asset.json";
import type { Database } from "@/integrations/supabase/types";

type Verified = {
  order_number: string;
  zone_name: string;
  region_name: string;
  validated_at: string | null;
  decided_role: string | null;
  status: string;
  items: { designation: string; unit: string; quantity: number }[];
} | null;

const verifyToken = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().max(100) }).parse(d))
  .handler(async ({ data }): Promise<Verified> => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: res, error } = await client.rpc("verify_order_token", { _token: data.token });
    if (error) return null;
    return (res as Verified) ?? null;
  });

export const Route = createFileRoute("/verifier/$token")({
  loader: async ({ params }) => verifyToken({ data: { token: params.token } }).catch(() => null),
  head: () => ({
    meta: [
      { title: "Vérification d'un bon de commande — ICORP" },
      { name: "description", content: "Vérifiez l'authenticité d'un bon de commande Intelligentsia Corporation." },
      { property: "og:title", content: "Vérification d'un bon de commande — ICORP" },
      { property: "og:description", content: "Vérifiez l'authenticité d'un bon de commande ICORP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <NotFound />,
  notFoundComponent: () => <NotFound />,
  component: VerifyPage,
});

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

const roleLabel: Record<string, string> = {
  admin_principal: "l'administrateur principal",
  admin_logistique: "l'administrateur logistique",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg space-y-5">
        <img src={logoAsset.url} alt="Intelligentsia Corporation" className="mx-auto -my-4 h-40 w-40 object-contain" />
        {children}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <Shell>
      <div className="card-surface space-y-3 p-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-destructive/15 px-4 py-2 text-sm font-bold text-destructive">
          <XCircle className="size-5" /> Bon introuvable
        </span>
        <p className="text-sm text-muted-foreground">
          Ce document n'a pas pu être vérifié. Il est peut-être falsifié ou n'existe plus.
        </p>
      </div>
    </Shell>
  );
}

function VerifyPage() {
  const v = Route.useLoaderData();
  if (!v) return <NotFound />;
  return (
    <Shell>
      <div className="card-surface space-y-5 p-5 sm:p-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-2 text-sm font-bold text-success">
            <CheckCircle2 className="size-5" /> Bon authentique
          </span>
          <h1 className="mt-4 text-2xl font-bold">{v.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            Validé le {fmt(v.validated_at)}
            {v.decided_role && roleLabel[v.decided_role] ? ` par ${roleLabel[v.decided_role]}` : ""}
          </p>
          {v.status === "ready" ? (
            <p className="mt-1 text-xs font-medium text-success">Commande disponible au retrait</p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Zone</dt>
            <dd className="font-semibold">{v.zone_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Région</dt>
            <dd className="font-semibold">{v.region_name}</dd>
          </div>
        </dl>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Produits</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {v.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3 px-3 py-2.5 text-sm">
                <span>{i.designation}</span>
                <span className="shrink-0 font-semibold">
                  {new Intl.NumberFormat("fr-FR").format(Number(i.quantity))} {i.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Intelligentsia Corporation — Il suffit d'y croire !</p>
    </Shell>
  );
}
