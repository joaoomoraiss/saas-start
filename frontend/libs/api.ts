import axios from "axios";

/**
 * Cliente HTTP do browser. Fala SO com as rotas /api do proprio Next (BFF),
 * que repassam para a API com o token da sessao. Nenhum token passa por aqui:
 * eles vivem em cookies httpOnly que o JavaScript nao le.
 */
const api = axios.create({
  baseURL: "/api",
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // O BFF marca a resposta quando o backend recusou a sessao (revogada,
    // expirada, senha trocada em outro dispositivo). Os cookies ja foram
    // apagados; resta levar a pessoa ao login.
    if (
      typeof window !== "undefined" &&
      axios.isAxiosError(error) &&
      error.response?.headers?.["x-session-expired"]
    ) {
      window.location.assign("/login");
    }

    return Promise.reject(error);
  },
);

export default api;
