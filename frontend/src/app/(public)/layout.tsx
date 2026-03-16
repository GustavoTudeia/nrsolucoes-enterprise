import Link from "next/link";
import { ArrowRight, Menu, Shield } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { NAV_PUBLIC, SOCIAL_PROOF } from "@/config/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-primary/25 via-accent/20 to-transparent blur-3xl" />
        <div className="absolute bottom-[-120px] right-[-120px] h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-accent/18 to-transparent blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.5)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.5)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.10]" />
      </div>

      <header className="sticky top-0 z-50 border-b bg-background/75 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-3">
          <BrandLogo />

          <nav className="hidden items-center gap-6 text-sm md:flex">
            {NAV_PUBLIC.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground no-underline transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" asChild>
              <Link href="/login" className="no-underline">
                Acessar
              </Link>
            </Button>
            <Button asChild>
              <Link href="/contato" className="no-underline">
                Solicitar demonstração <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <ModeToggle />
          </div>

          {/* Mobile menu */}
          <details className="relative md:hidden">
            <summary
              className="list-none rounded-xl border bg-background/80 p-2 text-foreground shadow-sm backdrop-blur hover:bg-background"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl border bg-background p-2 shadow-lg">
              <div className="flex flex-col">
                {NAV_PUBLIC.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="my-2 h-px bg-border" />
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                >
                  Acessar
                </Link>
                <Link
                  href="/contato"
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground no-underline hover:opacity-90"
                >
                  Solicitar demonstração
                </Link>
                <div className="mt-2 flex items-center justify-between px-2">
                  <span className="text-xs text-muted-foreground">Tema</span>
                  <ModeToggle />
                </div>
              </div>
            </div>
          </details>
        </div>
      </header>

      <main className="relative">{children}</main>

      <footer className="border-t bg-background/60">
        {/* Trust badges bar */}
        <div className="border-b">
          <div className="container flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4">
            {SOCIAL_PROOF.trustBadges.map((badge) => (
              <div key={badge} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3 text-primary" />
                <span>{badge}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="container grid gap-10 py-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <BrandLogo linked={false} />
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Plataforma enterprise para gestão de governança e evidências NR-1 (NR-1), com rastreabilidade, evidências
              e governança. Projetada para empresas com múltiplos CNPJs e operações distribuídas no Brasil.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SOCIAL_PROOF.metrics.map((m) => (
                <div key={m.label} className="rounded-lg border bg-muted/50 px-3 py-1.5">
                  <div className="text-sm font-bold text-foreground">{m.value}</div>
                  <div className="text-[10px] text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Aviso:</span> NR-1 é uma norma regulamentadora. Esta
              plataforma não é afiliada, endossada ou certificada por órgãos governamentais.
            </p>
          </div>

          <div className="md:col-span-2">
            <div className="text-sm font-semibold">Produto</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/recursos">Recursos</Link></li>
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/planos">Planos e preços</Link></li>
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/certificado/validar">Validar certificado</Link></li>
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/login">Acesso ao console</Link></li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <div className="text-sm font-semibold">Empresa</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/sobre">Sobre nós</Link></li>
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/contato">Fale com a equipe</Link></li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <div className="text-sm font-semibold">Legal</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/termos">Termos de uso</Link></li>
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/privacidade">Privacidade</Link></li>
              <li><Link className="text-muted-foreground no-underline hover:text-foreground" href="/lgpd">Política LGPD</Link></li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <div className="text-sm font-semibold">Segurança</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5"><Shield className="h-3 w-3 text-green-500" /> Dados criptografados</li>
              <li className="flex items-center gap-1.5"><Shield className="h-3 w-3 text-green-500" /> Isolamento por tenant</li>
              <li className="flex items-center gap-1.5"><Shield className="h-3 w-3 text-green-500" /> Backup automático</li>
              <li className="flex items-center gap-1.5"><Shield className="h-3 w-3 text-green-500" /> Logs de auditoria</li>
            </ul>
          </div>
        </div>

        <div className="border-t">
          <div className="container flex flex-col gap-2 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>© {new Date().getFullYear()} NR1 Soluções. Todos os direitos reservados.</span>
            <span>Plataforma enterprise para alta confiabilidade, acessibilidade e governança corporativa.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
