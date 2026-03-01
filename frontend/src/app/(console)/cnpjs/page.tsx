import { redirect } from "next/navigation";

// Backward-compatible route (older builds linked to /cnpjs)
export default function CnpjsRedirectPage() {
  redirect("/org/cnpjs");
}
