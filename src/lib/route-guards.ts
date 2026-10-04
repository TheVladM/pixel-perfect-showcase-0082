import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { fetchMe, type AppRole } from "@/lib/session";

/**
 * Route guard for `beforeLoad`: only lets active accounts with one of `roles` open the page,
 * everyone else is sent back to the dashboard. The database (RLS/RPC) stays the real barrier.
 */
export async function requireRole(queryClient: QueryClient, roles: AppRole[]) {
  const me = await queryClient.ensureQueryData({ queryKey: ["me"], queryFn: fetchMe });
  if (!me || !me.isActive || !me.role || !roles.includes(me.role)) {
    throw redirect({ to: "/tableau-de-bord", replace: true });
  }
}
