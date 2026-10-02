import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "bons-commande";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

async function download(admin: Admin, path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await admin.storage.from("prive").download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Generates the PDF once; returns the existing path if already generated. */
async function ensurePdf(admin: Admin, orderId: string, origin: string): Promise<string> {
  const { data: order, error } = await admin
    .from("orders")
    .select("*, zones(name, code, regions(name))")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new Error("Commande introuvable.");
  if (order.pdf_path) return order.pdf_path;
  if (!["validated", "ready"].includes(order.status) || !order.order_number || !order.verification_token)
    throw new Error("Le bon de commande n'est disponible qu'après validation.");

  const [{ data: items }, decider, logo, signature] = await Promise.all([
    admin.from("order_items").select("product_name, product_unit, retained_quantity").eq("order_id", orderId).gt("retained_quantity", 0).order("product_name"),
    order.decided_by
      ? admin.from("profiles").select("account_name").eq("id", order.decided_by).maybeSingle()
      : Promise.resolve({ data: null }),
    download(admin, "logo.png"),
    order.decided_role === "admin_principal" ? download(admin, "signature.png") : Promise.resolve(null),
  ]);

  const zone = order.zones as { name: string; code: string; regions: { name: string } | null } | null;
  const { buildOrderPdf } = await import("./order-pdf.server");
  const bytes = await buildOrderPdf({
    orderNumber: order.order_number,
    validatedAt: order.decided_at,
    zoneName: zone?.name ?? "",
    zoneCode: zone?.code ?? "",
    regionName: zone?.regions?.name ?? "",
    agentName: order.agent_name,
    comment: order.comment,
    decidedRole: order.decided_role,
    deciderName: (decider.data as { account_name: string } | null)?.account_name ?? null,
    items: (items ?? []).map((i) => ({ name: i.product_name, unit: i.product_unit, quantity: Number(i.retained_quantity) })),
    verifyUrl: `${origin}/verifier/${order.verification_token}`,
    logo,
    signature,
  });

  const path = `${order.order_number}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error("Échec de l'enregistrement du PDF.");
  // Only set if still empty — concurrent calls end up with the same single file.
  await admin.from("orders").update({ pdf_path: path }).eq("id", orderId).is("pdf_path", null);
  return path;
}

function originOf(): string {
  const req = getRequest();
  const url = new URL(req.url);
  const fwdHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return fwdHost ? `${proto}://${fwdHost}` : url.origin;
}

async function callerRole(supabase: { rpc: (fn: "current_user_role") => PromiseLike<{ data: unknown }> }) {
  const { data } = await supabase.rpc("current_user_role");
  return data as string | null;
}

export const generateOrderPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: canManage } = await context.supabase.rpc("can_manage_orders");
    if (!canManage) throw new Error("Action non autorisée.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { path: await ensurePdf(supabaseAdmin, data.orderId, originOf()) };
  });

export const getOrderPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [role, active] = await Promise.all([
      callerRole(context.supabase),
      context.supabase.rpc("is_active"),
    ]);
    if (!active.data) throw new Error("Action non autorisée.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (role === "zone") {
      const [{ data: zoneId }, { data: order }] = await Promise.all([
        context.supabase.rpc("current_zone_id"),
        supabaseAdmin.from("orders").select("zone_id").eq("id", data.orderId).maybeSingle(),
      ]);
      if (!order || !zoneId || order.zone_id !== zoneId) throw new Error("Action non autorisée.");
    } else if (role !== "admin_principal" && role !== "admin_logistique") {
      throw new Error("Action non autorisée.");
    }
    const path = await ensurePdf(supabaseAdmin, data.orderId, originOf());
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 120);
    if (error || !signed) throw new Error("Impossible de générer le lien de téléchargement.");
    return { url: signed.signedUrl };
  });
