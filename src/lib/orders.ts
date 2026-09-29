import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrderStatus = "pending" | "cancelled" | "validated" | "rejected" | "ready";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  cancelled: "Annulée",
  validated: "Validée",
  rejected: "Rejetée",
  ready: "Disponible",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-accent/20 text-accent-foreground",
  cancelled: "bg-muted text-muted-foreground",
  validated: "bg-primary-soft text-primary",
  rejected: "bg-destructive/15 text-destructive",
  ready: "bg-success/15 text-success",
};

export const HISTORY_LABELS: Record<string, string> = {
  created: "Commande créée",
  cancelled: "Commande annulée",
  adjusted: "Quantités ajustées",
  validated: "Commande validée",
  rejected: "Commande rejetée",
  ready: "Marquée disponible",
};

export const CART_KEY = "icorp_cart";

export function formatQty(n: number | string): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(n));
}

export function useProducts(onlyAvailable = false) {
  return useQuery({
    queryKey: ["products", onlyAvailable],
    queryFn: async () => {
      let q = supabase.from("products").select("*").order("name");
      if (onlyAvailable) q = q.eq("is_available", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, zones(name, code, region_id, regions(name)), order_items(id, retained_quantity)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const [o, items, history] = await Promise.all([
        supabase
          .from("orders")
          .select("*, zones(name, code, regions(name))")
          .eq("id", orderId)
          .maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
        supabase
          .from("order_history")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }),
      ]);
      if (o.error) throw o.error;
      if (items.error) throw items.error;
      if (history.error) throw history.error;
      return { order: o.data, items: items.data, history: history.data };
    },
  });
}
