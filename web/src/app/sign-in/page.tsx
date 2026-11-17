"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Landing } from "@/components/landing/landing";

/** /sign-in is the landing page with the sign-in popup open. After signing in it goes to ?next=
 *  (or Today); closing the popup leaves the visitor on the landing page. */
function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <Landing
      signIn={{ email: params.get("email") ?? undefined, next: params.get("next") }}
      onSignInClose={() => router.replace("/")}
    />
  );
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInPage />
    </Suspense>
  );
}
