import { redirect } from "next/navigation";

// Backward-compatible route (older builds linked to /reports)
export default function ReportsRedirectPage() {
  redirect("/relatorios");
}
