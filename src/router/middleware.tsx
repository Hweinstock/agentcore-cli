import type { Handler } from "./handler";

export type Middleware = ((handler: Handler) => Handler) & {
  runAfterDescendants?: boolean;
};

export interface MiddlewareProvider {
  middlewares(): Middleware[];
}

export function isMiddlewareProvider(h: Handler): h is Handler & MiddlewareProvider {
  return typeof (h as Partial<MiddlewareProvider>).middlewares === "function";
}
