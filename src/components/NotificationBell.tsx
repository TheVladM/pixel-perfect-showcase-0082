import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationBell({ userId, className }: { userId: string; className?: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const key = ["notifications", userId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [list, unread] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .eq("recipient_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", userId)
          .eq("is_read", false),
      ]);
      if (list.error) throw list.error;
      return { items: list.data, unread: unread.count ?? 0 };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
          void queryClient.invalidateQueries({ queryKey: ["orders"] });
          void queryClient.invalidateQueries({ queryKey: ["order"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  async function open(id: string, link: string | null) {
    await supabase.rpc("mark_notification_read", { _id: id });
    void queryClient.invalidateQueries({ queryKey: key });
    if (link) navigate({ to: link });
  }

  async function markAll() {
    await supabase.rpc("mark_all_read");
    void queryClient.invalidateQueries({ queryKey: key });
  }

  const unread = data?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className={cn(
            "relative flex size-11 items-center justify-center rounded-lg hover:bg-sidebar-accent",
            className,
          )}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? (
            <button onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-primary">
              <CheckCheck className="size-4" /> Tout marquer comme lu
            </button>
          ) : null}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!data?.items.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune notification.</p>
          ) : (
            data.items.map((n) => (
              <button
                key={n.id}
                onClick={() => open(n.id, n.link)}
                className={cn(
                  "block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted",
                  !n.is_read && "bg-primary-soft/50",
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p> : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
