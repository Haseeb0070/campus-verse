import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** An address that doesn't exist: signed-out visitors go to the landing page, signed-in people
 *  to Today. */
export default async function NotFound() {
  const signedIn = (await cookies()).has("sessionid");
  redirect(signedIn ? "/today" : "/");
}
