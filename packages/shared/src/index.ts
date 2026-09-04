// Types only, no runtime code. Erases at compile time, so it costs nothing in apps/web's bundle
// and doesn't drag a shared zod (or any) runtime dependency across the api/web boundary. The
// tradeoff — these can drift from the API's actual responses — is accepted for now; the real fix
// is generating this file from the OpenAPI spec apps/api already serves at /api-docs.json.

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ApiErrorBody {
  status: number;
  description: string;
  invalid_params?: { id: string; message: string }[];
}

export interface PizzaType {
  id: number;
  name: string;
  price: number;
}
