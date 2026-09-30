import { createFileRoute } from "@tanstack/react-router";
import { OrderDetail } from "@/components/OrderDetail";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/commandes/$orderId")({
  head: () => ({
    meta: [
      { title: "Détail de la commande — ICORP Terrain" },
      { name: "description", content: "Traitement d'une commande de zone." },
      { property: "og:title", content: "Détail de la commande — ICORP Terrain" },
      { property: "og:description", content: "Traitement d'une commande de zone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { orderId } = Route.useParams();
  const { data: me } = useMe();
  if (!me) return null;
  const canManage = me.role === "admin_principal" || me.role === "admin_logistique";
  if (me.role === "zone") return <OrderDetail orderId={orderId} mode="zone" />;
  return <OrderDetail orderId={orderId} mode={canManage ? "admin" : "readonly"} />;
}
