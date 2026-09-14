import api from "@/libs/api";

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

// ─── POST /contact ───────────────────────────────────────────────
// So o servidor Next pode chamar a rota (SERVICE_TOKEN). Limite de 5 envios
// por hora por IP (429). 503 quando CONTACT_EMAIL nao esta configurado.

export async function sendContactMessage(
  data: ContactMessage,
): Promise<{ sent: true }> {
  const response = await api.post("/contact", data);
  return response.data;
}
