"use server";

import { verifyJwtToken } from "./auth";
import { getToken } from "./getToken";

/** Checagem de sessão para Client Components (ex.: header, pricing). */
export async function isLogged() {
  const token = await getToken("refreshToken");

  return (await verifyJwtToken(token)) !== null;
}
