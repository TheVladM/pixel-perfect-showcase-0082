import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin_principal"
  | "admin_logistique"
  | "dg"
  | "promoteur"
  | "superviseur"
  | "zone";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin_principal: "Administrateur principal",
  admin_logistique: "Administrateur logistique",
  dg: "Directeur général",
  promoteur: "Promoteur",
  superviseur: "Superviseur",
  zone: "Zone",
};

export type Me = {
  userId: string;
  email: string;
  accountName: string;
  isActive: boolean;
  role: AppRole | null;
  zoneId: string | null;
  zoneName: string | null;
  zoneCode: string | null;
  regionId: string | null;
  regionName: string | null;
};

export async function fetchMe(): Promise<Me | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("account_name, email, is_active, zone_id, region_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  let zoneName: string | null = null;
  let zoneCode: string | null = null;
  let regionName: string | null = null;
  let regionId: string | null = profile?.region_id ?? null;

  if (profile?.zone_id) {
    const { data: zone } = await supabase
      .from("zones")
      .select("name, code, region_id, regions(name)")
      .eq("id", profile.zone_id)
      .maybeSingle();
    zoneName = zone?.name ?? null;
    zoneCode = zone?.code ?? null;
    regionName = (zone as { regions?: { name: string } | null } | null)?.regions?.name ?? null;
    regionId = regionId ?? zone?.region_id ?? null;
  } else if (regionId) {
    const { data: region } = await supabase
      .from("regions")
      .select("name")
      .eq("id", regionId)
      .maybeSingle();
    regionName = region?.name ?? null;
  }

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? "",
    accountName: profile?.account_name ?? user.email ?? "Compte",
    isActive: profile?.is_active ?? false,
    role: ((roles?.[0]?.role as AppRole | undefined) ?? null) as AppRole | null,
    zoneId: profile?.zone_id ?? null,
    zoneName,
    zoneCode,
    regionId,
    regionName,
  };
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
  });
}
