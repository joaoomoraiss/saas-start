"use server";

import { cookies } from "next/headers";

export async function getToken(cookieName: string) {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(cookieName)?.value ?? null;
  } catch {
    // Fora de um request scope (ex.: build estático) não há cookies.
    return null;
  }
}
