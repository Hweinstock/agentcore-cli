import type z from "zod";
import type { Flag } from "../../router";

export type ResourceFlagValues<F extends readonly Flag<string, unknown>[]> = {
  [E in F[number] as E["name"]]: E extends Flag<string, infer T> ? z.infer<z.ZodType<T>> : never;
};
