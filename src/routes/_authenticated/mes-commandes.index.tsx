import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { PageHeader, Button } from "@/components/AppShell";
import { OrderList } from "@/components/OrderList";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/mes-commandes/")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["zone"]),
  head: () => ({
    meta: [
      { title: "Mes commandes — ICORP Terrain" },
      { name: "description", content: "Suivi des commandes de votre zone." },
      { property: "og:title", content: "Mes commandes — ICORP Terrain" },
      { property: "og:description", content: "Suivi des commandes de votre zone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div>
      <PageHeader
        title="Mes commandes"
        action={
          <Button asChild className="h-11">
            <Link to="/commander"><ShoppingCart className="size-4" /> Nouvelle commande</Link>
          </Button>
        }
      />
      <OrderList mode="zone" />
    </div>
  ),
});
