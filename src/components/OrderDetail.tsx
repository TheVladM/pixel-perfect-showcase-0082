import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, History, Loader2, Plus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { generateOrderPdf, getOrderPdfUrl } from "@/lib/order-pdf.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, frenchError } from "@/lib/format";
import { HISTORY_LABELS, formatQty, useOrder, useProducts, type OrderStatus } from "@/lib/orders";
import { ROLE_LABELS, type AppRole } from "@/lib/session";

type Mode = "zone" | "admin" | "readonly";
type EditItem = {
  product_id: string;
  product_name: string;
  product_unit: string;
  requested_quantity: number;
  retained: string;
  added_by_admin: boolean;
};

export function OrderDetail({ orderId, mode }: { orderId: string; mode: Mode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useOrder(orderId);
  const { data: products } = useProducts(true);
  const [edit, setEdit] = useState<EditItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmValidate, setConfirmValidate] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [readyOpen, setReadyOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [addProduct, setAddProduct] = useState("");
  const [downloading, setDownloading] = useState(false);
  const genPdf = useServerFn(generateOrderPdf);
  const pdfUrl = useServerFn(getOrderPdfUrl);

  async function downloadPdf() {
    // Open the tab synchronously so mobile browsers don't block it as a popup.
    const win = window.open("", "_blank");
    setDownloading(true);
    try {
      const { url } = await pdfUrl({ data: { orderId } });
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      toast.error(frenchError(e instanceof Error ? e.message : null));
    } finally {
      setDownloading(false);
    }
  }

  const order = data?.order;
  const status = order?.status as OrderStatus | undefined;
  const editable = mode === "admin" && status === "pending";

  useEffect(() => {
    if (!data) return;
    setEdit(
      data.items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        product_unit: i.product_unit,
        requested_quantity: Number(i.requested_quantity),
        retained: String(i.retained_quantity),
        added_by_admin: i.added_by_admin,
      })),
    );
  }, [data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
  }

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast.error(frenchError(error.message));
      refresh();
      return false;
    }
    toast.success(ok);
    refresh();
    return true;
  }

  const dirty =
    !!data &&
    (edit.length !== data.items.length ||
      edit.some((e) => {
        const orig = data.items.find((i) => i.product_id === e.product_id);
        return !orig || Number(orig.retained_quantity) !== Number(e.retained);
      }));

  async function saveAdjust() {
    if (edit.some((e) => e.retained === "" || Number(e.retained) < 0 || Number.isNaN(Number(e.retained)))) {
      toast.error("Les quantités doivent être des nombres positifs.");
      return;
    }
    await run(
      () =>
        supabase.rpc("adjust_order", {
          _order_id: orderId,
          _items: edit.map((e) => ({
            product_id: e.product_id,
            retained_quantity: Number(e.retained),
            added_by_admin: e.added_by_admin,
          })),
        }),
      "Quantités enregistrées.",
    );
  }

  function removeItem(pid: string) {
    setEdit((prev) =>
      prev.flatMap((e) => (e.product_id !== pid ? [e] : e.added_by_admin ? [] : [{ ...e, retained: "0" }])),
    );
  }

  function addItem() {
    const p = products?.find((x) => x.id === addProduct);
    if (!p) return;
    setEdit((prev) => [
      ...prev,
      {
        product_id: p.id,
        product_name: p.name,
        product_unit: p.unit,
        requested_quantity: 0,
        retained: "1",
        added_by_admin: true,
      },
    ]);
    setAddProduct("");
  }

  const backTo = mode === "zone" ? "/mes-commandes" : "/commandes";

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!order || !status)
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Commande introuvable.</p>
        <Button asChild variant="outline">
          <Link to={backTo}>Retour</Link>
        </Button>
      </div>
    );

  const zone = order.zones as { name: string; code: string; regions: { name: string } | null } | null;
  const available = (products ?? []).filter((p) => !edit.some((e) => e.product_id === p.id));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        <ArrowLeft className="size-4" /> Retour aux commandes
      </Link>

      <div className="card-surface space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{order.order_number ?? "Commande sans numéro"}</h1>
            <p className="text-sm text-muted-foreground">Passée le {formatDateTime(order.created_at)}</p>
          </div>
          <OrderStatusBadge status={status} />
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="Zone" value={zone ? `${zone.name} (${zone.code})` : "—"} />
          <Info label="Région" value={zone?.regions?.name ?? "—"} />
          <Info label="Agent" value={order.agent_name} />
          {order.decided_at ? <Info label="Décision le" value={formatDateTime(order.decided_at)} /> : null}
          {order.comment ? <Info label="Commentaire" value={order.comment} wide /> : null}
        </dl>
        {status === "rejected" && order.rejection_reason ? (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm">
            <p className="font-semibold text-destructive">Motif du rejet</p>
            <p className="mt-1">{order.rejection_reason}</p>
          </div>
        ) : null}
        {status === "ready" && order.pickup_instructions ? (
          <div className="rounded-lg bg-success/10 p-3 text-sm">
            <p className="font-semibold text-success">Instructions de retrait</p>
            <p className="mt-1 whitespace-pre-wrap">{order.pickup_instructions}</p>
          </div>
        ) : null}
      </div>

      <div className="card-surface p-4 sm:p-6">
        <h2 className="mb-3 text-base font-semibold">Produits</h2>
        <ul className="divide-y divide-border">
          {edit.map((e) => {
            const differs = e.requested_quantity !== Number(e.retained);
            return (
              <li key={e.product_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {e.product_name}
                    {e.added_by_admin ? (
                      <span className="ml-2 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Ajouté par l'administration
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.added_by_admin
                      ? "Non demandé par la zone"
                      : `Demandé : ${formatQty(e.requested_quantity)} ${e.product_unit}`}
                  </p>
                </div>
                {editable ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={e.retained}
                      onChange={(ev) =>
                        setEdit((prev) =>
                          prev.map((x) => (x.product_id === e.product_id ? { ...x, retained: ev.target.value } : x)),
                        )
                      }
                      className="h-11 w-24"
                      aria-label={`Quantité retenue ${e.product_name}`}
                    />
                    <span className="w-14 text-xs text-muted-foreground">{e.product_unit}</span>
                    <Button size="icon" variant="ghost" onClick={() => removeItem(e.product_id)} aria-label="Retirer">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatQty(e.retained)} {e.product_unit}
                    </p>
                    {differs && !e.added_by_admin ? (
                      <p className="text-xs text-accent-foreground">Retenu (demandé {formatQty(e.requested_quantity)})</p>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {editable ? (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={addProduct} onValueChange={setAddProduct}>
                <SelectTrigger className="h-11 flex-1">
                  <SelectValue placeholder="Ajouter un produit du catalogue" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="h-11" onClick={addItem} disabled={!addProduct}>
                <Plus className="size-4" /> Ajouter
              </Button>
            </div>
            <Button className="h-11 w-full sm:w-auto" onClick={saveAdjust} disabled={!dirty || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Enregistrer les ajustements
            </Button>
          </div>
        ) : null}
      </div>

      {mode === "admin" && status === "pending" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="h-12 flex-1" disabled={busy || dirty} onClick={() => setConfirmValidate(true)}>
            Valider
          </Button>
          <Button variant="destructive" className="h-12 flex-1" disabled={busy} onClick={() => setRejectOpen(true)}>
            Rejeter
          </Button>
        </div>
      ) : null}
      {mode === "admin" && status === "pending" && dirty ? (
        <p className="text-xs text-muted-foreground">Enregistrez les ajustements avant de valider.</p>
      ) : null}
      {mode !== "readonly" && (status === "validated" || status === "ready") ? (
        <Button variant="outline" className="h-12 w-full" onClick={downloadPdf} disabled={downloading}>
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Télécharger le PDF
        </Button>
      ) : null}
      {mode === "admin" && status === "validated" ? (
        <Button className="h-12 w-full" onClick={() => setReadyOpen(true)}>
          Marquer disponible
        </Button>
      ) : null}
      {mode === "zone" && status === "pending" ? (
        <Button variant="destructive" className="h-12 w-full" onClick={() => setConfirmCancel(true)}>
          Annuler
        </Button>
      ) : null}

      {mode !== "zone" && data.history.length ? (
        <div className="card-surface p-4 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <History className="size-4" /> Historique
          </h2>
          <ul className="space-y-3">
            {data.history.map((h) => (
              <li key={h.id} className="text-sm">
                <p className="font-medium">{HISTORY_LABELS[h.action] ?? h.action}</p>
                <p className="text-xs text-muted-foreground">
                  {h.actor_name ?? "—"}
                  {h.actor_role ? ` · ${ROLE_LABELS[h.actor_role as AppRole] ?? h.actor_role}` : ""} ·{" "}
                  {formatDateTime(h.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AlertDialog open={confirmValidate} onOpenChange={setConfirmValidate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Valider cette commande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un numéro de bon de commande sera attribué. Les quantités ne pourront plus être modifiées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const ok = await run(
                  () => supabase.rpc("decide_order", { _order_id: orderId, _decision: "validated", _reason: "" }),
                  "Commande validée.",
                );
                if (ok) {
                  try {
                    await genPdf({ data: { orderId } });
                    refresh();
                  } catch {
                    toast.error("Le PDF sera généré au premier téléchargement.");
                  }
                }
              }}
            >
              Valider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler cette commande ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run(() => supabase.rpc("cancel_order", { _order_id: orderId }), "Commande annulée.")
              }
            >
              Annuler la commande
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la commande</DialogTitle>
            <DialogDescription>Le motif sera communiqué à la zone.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="reason">Motif du rejet *</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Retour
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || busy}
              onClick={async () => {
                const ok = await run(
                  () =>
                    supabase.rpc("decide_order", { _order_id: orderId, _decision: "rejected", _reason: reason }),
                  "Commande rejetée.",
                );
                if (ok) setRejectOpen(false);
              }}
            >
              Rejeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={readyOpen} onOpenChange={setReadyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer disponible</DialogTitle>
            <DialogDescription>Indiquez où et quand la zone peut retirer la commande.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="pickup">Instructions de retrait *</Label>
          <Textarea id="pickup" value={pickup} onChange={(e) => setPickup(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReadyOpen(false)}>
              Retour
            </Button>
            <Button
              disabled={!pickup.trim() || busy}
              onClick={async () => {
                const ok = await run(
                  () => supabase.rpc("mark_order_ready", { _order_id: orderId, _pickup_instructions: pickup }),
                  "Commande marquée disponible.",
                );
                if (ok) setReadyOpen(false);
              }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
