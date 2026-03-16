export const BRAND = {
  name: "NR1 Soluções",
  product: "Plataforma NR-1",
  tagline: "Governança e evidências NR-1 enterprise, do inventário vivo ao plano de ação auditável.",
  shortTagline: "NR-1 enterprise, do inventário à evidência.",
} as const;

const SUPPORT_WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "5511999999999"
).replace(/\D/g, "");

const SUPPORT_WHATSAPP_MESSAGE =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_MESSAGE ??
  "Olá! Preciso de ajuda com a plataforma NR Soluções (Enterprise).";

export const SUPPORT = {
  whatsapp: {
    number: SUPPORT_WHATSAPP_NUMBER,
    message: SUPPORT_WHATSAPP_MESSAGE,
    url: `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
      SUPPORT_WHATSAPP_MESSAGE
    )}`,
  },
} as const;

export const NAV_PUBLIC = [
  { label: "Recursos", href: "/recursos" },
  { label: "Planos", href: "/planos" },
  { label: "Sobre", href: "/sobre" },
  { label: "Certificados", href: "/certificado/validar" },
  { label: "Contato", href: "/contato" },
] as const;

export const SOCIAL_PROOF = {
  metrics: [
    { value: "Enterprise-ready", label: "Arquitetura multi-tenant" },
    { value: "NR-1", label: "Inventário + plano de ação" },
    { value: "LGPD", label: "Agregação com limiar mínimo" },
    { value: "Auditável", label: "Trilha de evidências" },
  ],
  trustBadges: [
    "LGPD by Design",
    "Criptografia AES-256",
    "Backup diário",
    "Multi-tenant isolado",
    "Auditoria completa",
    "SLA Enterprise",
  ],
} as const;
