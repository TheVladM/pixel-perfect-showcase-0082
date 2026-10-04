import { createFileRoute } from "@tanstack/react-router";
import { OrderDetail } from "@/components/OrderDetail";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/mes-commandes/$orderId")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ["zone"]),
  head: () => ({
    meta: [
      { title: "Ma commande — ICORP Terrain" },
      { name: "description", content: "Détail d'une commande de votre zone." },
      { property: "og:title", content: "Ma commande — ICORP Terrain" },
      { property: "og:description", content: "Détail d'une commande de votre zone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { orderId } = Route.useParams();
  return <OrderDetail orderId={orderId} mode="zone" />;
}
