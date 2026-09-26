import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRegions() {
  return useQuery({
    queryKey: ["regions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("regions").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useZones() {
  return useQuery({
    queryKey: ["zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zones")
        .select("id, name, code, region_id, regions(name)")
        .order("code");
      if (error) throw error;
      return data;
    },
  });
}

export function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useSeries() {
  return useQuery({
    queryKey: ["series"],
    queryFn: async () => {
      const { data, error } = await supabase.from("series").select("*").order("label");
      if (error) throw error;
      return data;
    },
  });
}

export function useSchools(zoneId?: string | null) {
  return useQuery({
    queryKey: ["schools", zoneId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("schools").select("id, name, zone_id, zones(name, code)").order("name");
      if (zoneId) q = q.eq("zone_id", zoneId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useFormFields(campaignId?: string) {
  return useQuery({
    queryKey: ["form_fields", campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_fields")
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}
