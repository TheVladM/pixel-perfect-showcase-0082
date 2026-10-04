import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const ROLES = [
  "admin_principal",
  "admin_logistique",
  "dg",
  "promoteur",
  "superviseur",
  "zone",
] as const;

async function assertAdminPrincipal(context: {
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("is_admin_principal", {});
  if (data !== true) {
    throw new Error("Action réservée à l'administrateur principal actif.");
  }
}

/**
 * Writes an audit entry attributed to the calling admin. The audit trigger cannot see the
 * caller (service role => auth.uid() is null), so this extra row records the real actor.
 */
async function logAdminAction(entry: {
  actorId: string;
  action: string;
  tableName: string;
  recordId: string;
  newData?: Json;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("audit_log").insert({
    actor_id: entry.actorId,
    actor_role: "admin_principal",
    action: entry.action,
    table_name: entry.tableName,
    record_id: entry.recordId,
    new_data: entry.newData ?? null,
  });
  if (error) console.error("[audit] échec d'écriture du journal :", error.message);
}

/** Records every login attempt (successful or not). */
export const logLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ email: z.string().max(320), success: z.boolean(), userAgent: z.string().max(500) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_login_attempt", {
      _email: data.email,
      _success: data.success,
      _user_agent: data.userAgent,
    });
    return { ok: true };
  });

/** True while no admin_principal account exists yet. */
export const initializationAvailable = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin_principal");
  return { available: (count ?? 0) === 0 };
});

/** Creates the very first admin_principal account. Only possible while none exists. */
export const createFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        accountName: z.string().min(2).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin_principal");
    if ((count ?? 0) > 0) {
      throw new Error("L'initialisation a déjà été effectuée.");
    }
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "Création impossible.");
    const userId = created.user.id;
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userId, account_name: data.accountName, email: data.email, is_active: true });
    if (pErr) throw new Error(pErr.message);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin_principal" });
    if (rErr) throw new Error(rErr.message);
    return { ok: true };
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        accountName: z.string().min(2).max(120),
        role: z.enum(ROLES),
        regionId: z.string().uuid().nullable().optional(),
        zoneId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPrincipal(context as never);
    if (data.role === "superviseur" && !data.regionId) {
      throw new Error("La région est obligatoire pour un superviseur.");
    }
    if (data.role === "zone" && !data.zoneId) {
      throw new Error("La zone est obligatoire pour un compte zone.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "Création impossible.");
    const userId = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      account_name: data.accountName,
      email: data.email,
      region_id: data.role === "superviseur" ? (data.regionId ?? null) : null,
      zone_id: data.role === "zone" ? (data.zoneId ?? null) : null,
      is_active: true,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(pErr.message);
    }
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (rErr) {
      // Deleting the auth user cascades to the profile: no orphan account without a role.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(rErr.message);
    }
    await logAdminAction({
      actorId: context.userId,
      action: "ADMIN_CREATE_ACCOUNT",
      tableName: "profiles",
      recordId: userId,
      newData: {
        email: data.email,
        account_name: data.accountName,
        role: data.role,
        region_id: data.role === "superviseur" ? (data.regionId ?? null) : null,
        zone_id: data.role === "zone" ? (data.zoneId ?? null) : null,
      },
    });
    return { ok: true };
  });

export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPrincipal(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await logAdminAction({
      actorId: context.userId,
      action: "ADMIN_RESET_PASSWORD",
      tableName: "auth.users",
      recordId: data.userId,
      newData: { password_reset: true },
    });
    return { ok: true };
  });

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdminPrincipal(context as never);
    if (data.userId === context.userId && !data.active) {
      throw new Error("Vous ne pouvez pas désactiver votre propre compte.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);
    await logAdminAction({
      actorId: context.userId,
      action: data.active ? "ADMIN_REACTIVATE_ACCOUNT" : "ADMIN_DEACTIVATE_ACCOUNT",
      tableName: "profiles",
      recordId: data.userId,
      newData: { is_active: data.active },
    });
    return { ok: true };
  });
