import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/session";

export type Account = {
  id: string;
  accountName: string;
  email: string;
  isActive: boolean;
  regionId: string | null;
  zoneId: string | null;
  createdAt: string;
  role: AppRole | null;
};

/** All accounts (profiles + role). Only admin_principal (and read-all roles) see every row. */
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => {
      const [profiles, roles] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, account_name, email, is_active, region_id, zone_id, created_at")
          .order("account_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      const roleByUser = new Map<string, AppRole>();
      for (const r of roles.data) roleByUser.set(r.user_id, r.role);
      return profiles.data.map((p) => ({
        id: p.id,
        accountName: p.account_name,
        email: p.email,
        isActive: p.is_active,
        regionId: p.region_id,
        zoneId: p.zone_id,
        createdAt: p.created_at,
        role: roleByUser.get(p.id) ?? null,
      }));
    },
  });
}
