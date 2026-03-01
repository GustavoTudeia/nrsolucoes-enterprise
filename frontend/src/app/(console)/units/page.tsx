import { redirect } from "next/navigation";

// Backward-compatible route (older builds linked to /units)
export default function UnitsRedirectPage() {
  redirect("/org/unidades");
}
