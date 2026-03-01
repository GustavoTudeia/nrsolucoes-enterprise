"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { consumeMagicToken } from "@/lib/api/employeePortal";
import { toast } from "sonner";

export default function EmployeeMagicPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await consumeMagicToken(token);
        toast.success("Acesso liberado");
        router.push("/employee/dashboard");
        router.refresh();
      } catch (e: any) {
        toast.error(e?.message || "Link inválido/expirado");
        router.push("/");
      }
    })();
  }, [token]);

  return (
    <div className="container py-12 text-sm text-muted-foreground">
      Validando link…
    </div>
  );
}
