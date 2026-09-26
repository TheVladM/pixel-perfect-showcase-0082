export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export type CampaignStatus = "À venir" | "Ouverte" | "Clôturée" | "Rouverte";

export function campaignStatus(c: {
  start_date: string;
  end_date: string;
  reopened: boolean;
}): CampaignStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (c.reopened) return "Rouverte";
  if (today < c.start_date) return "À venir";
  if (today > c.end_date) return "Clôturée";
  return "Ouverte";
}

export function isCampaignOpen(c: {
  start_date: string;
  end_date: string;
  reopened: boolean;
}): boolean {
  const s = campaignStatus(c);
  return s === "Ouverte" || s === "Rouverte";
}

export function sexLabel(sex: string): string {
  return sex === "M" ? "Masculin" : "Féminin";
}

export function frenchError(message?: string | null): string {
  const m = (message ?? "").trim();
  if (!m) return "Une erreur est survenue. Veuillez réessayer.";
  if (/invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Ce compte n'est pas encore confirmé.";
  if (/user is banned|banned/i.test(m)) return "Ce compte est désactivé. Contactez l'administrateur principal.";
  if (/duplicate key|already exists/i.test(m)) return "Cet enregistrement existe déjà.";
  if (/row-level security|permission denied/i.test(m))
    return "Action non autorisée pour votre compte.";
  return m;
}
