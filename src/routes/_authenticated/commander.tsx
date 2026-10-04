import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Minus, Package, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { frenchError } from "@/lib/format";
import { formatQty, useProducts } from "@/lib/orders";
import { useMe } from "@/lib/session";
import { requireRole } from "@/lib/route-guards";

const AGENT_KEY = "icorp_agent_name";

export const Route = createFileRoute("/_authenticated/commander")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["zone"]),
  head: () => ({
    meta: [
      { title: "Catalogue — ICORP Terrain" },
      { name: "description", content: "Commander du matériel pour votre zone." },
      { property: "og:title", content: "Catalogue — ICORP Terrain" },
      { property: "og:description", content: "Commander du matériel pour votre zone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ZoneCatalog,
});

function ZoneCatalog() {
  const { data: me } = useMe();
  const { data: products, isLoading } = useProducts(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setAgent(localStorage.getItem(AGENT_KEY) ?? "");
  }, []);

  const selected = (products ?? []).filter((p) => (cart[p.id] ?? 0) > 0);

  function setQty(id: string, q: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.round(q * 100) / 100) }));
  }

  async function send() {
    if (!me?.zoneId) return;
    if (!agent.trim()) {
      toast.error("Le nom de l'agent est obligatoire.");
      return;
    }
    setSending(true);
    localStorage.setItem(AGENT_KEY, agent.trim());
    const { data, error } = await supabase.rpc("create_order", {
      _zone_id: me.zoneId,
      _agent_name: agent.trim(),
      _comment: comment,
      _items: selected.map((p) => ({ product_id: p.id, quantity: cart[p.id] })),
    });
    setSending(false);
    if (error) {
      toast.error(frenchError(error.message));
      return;
    }
    toast.success("Commande envoyée.");
    setCart({});
    setOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    navigate({ to: "/mes-commandes/$orderId", params: { orderId: data as string } });
  }

  return (
    <div className="pb-20">
      <PageHeader title="Catalogue" description="Choisissez les produits et les quantités à commander." />
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !products?.length ? (
        <EmptyState icon={Package} title="Aucun produit disponible" description="Le catalogue est vide pour le moment." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const q = cart[p.id] ?? 0;
            return (
              <div key={p.id} className="card-surface flex flex-col justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">Unité : {p.unit}</p>
                  {p.description ? <p className="mt-1 text-sm text-muted-foreground">{p.description}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(p.id, q - 1)} disabled={q <= 0} aria-label="Diminuer">
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={q || ""}
                    placeholder="0"
                    onChange={(e) => setQty(p.id, Number(e.target.value) || 0)}
                    className="h-11 text-center"
                    aria-label={`Quantité ${p.name}`}
                  />
                  <Button size="icon" variant="outline" className="size-11" onClick={() => setQty(p.id, q + 1)} aria-label="Augmenter">
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.length > 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-lg lg:bottom-8 lg:right-8"
        >
          <ShoppingCart className="size-5" /> Panier
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{selected.length}</span>
        </button>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Vérifier la commande</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <ul className="divide-y divide-border rounded-lg border border-border">
              {selected.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span>{formatQty(cart[p.id] ?? 0)} {p.unit}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <Label htmlFor="agent">Nom de l'agent *</Label>
              <Input id="agent" className="h-11" value={agent} onChange={(e) => setAgent(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comment">Commentaire</Label>
              <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
            </div>
            <Button className="h-12 w-full" onClick={send} disabled={sending}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : null} Envoyer la commande
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
