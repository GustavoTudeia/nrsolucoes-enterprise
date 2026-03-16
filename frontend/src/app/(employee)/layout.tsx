import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { EmployeeAnalyticsBridge } from "@/components/analytics/employee-analytics-bridge";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="no-underline">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary" />
              <div className="text-sm font-semibold">NRSoluções • Portal</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button asChild variant="outline" size="sm">
              <Link className="no-underline" href="/">Site</Link>
            </Button>
          </div>
        </div>
      </header>
      <EmployeeAnalyticsBridge />
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="container py-6 text-xs text-muted-foreground">
          Portal do colaborador • Conteúdos e confirmações de conclusão.
        </div>
      </footer>
    </div>
  );
}
