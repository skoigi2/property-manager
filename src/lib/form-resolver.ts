import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * zodResolver typed by the schema's OUTPUT shape.
 *
 * Every form in this app declares `useForm<z.infer<typeof schema>>` (the
 * post-coercion type) while the schemas use `z.coerce.number()` etc., whose
 * INPUT type is `unknown`. @hookform/resolvers v5 (the first release that
 * understands Zod 4's error shape — v3 rethrew every validation failure as an
 * uncaught ZodError) types the resolver by input, so the two no longer line
 * up. The runtime behaviour is unchanged: values handed to onSubmit are the
 * parsed output.
 */
export function formResolver<T extends FieldValues>(schema: ZodType<T, unknown>): Resolver<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return zodResolver(schema as any) as unknown as Resolver<T>;
}
