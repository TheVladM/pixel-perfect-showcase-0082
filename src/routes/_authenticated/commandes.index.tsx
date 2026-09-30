import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { OrderList } from "@/components/OrderList";

export const Route = createFileRoute("/_authenticated/commandes/")({
  head: () => ({
    meta: [
      { title: "Commandes — ICORP Terrain" },
      { name: "description", content: "Toutes les commandes des zones." },
      { property: "og:title", content: "Commandes — ICORP Terrain" },
      { property: "og:description", content: "Toutes les commandes des zones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Commandes" description="Toutes les commandes des zones, les plus récentes en premier." />
      <OrderList mode="all" />
    </div>
  ),
});
