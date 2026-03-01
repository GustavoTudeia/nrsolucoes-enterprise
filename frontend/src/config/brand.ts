export const BRAND = {
  name: "NR1 Soluções",
  product: "Plataforma NR-1",
  tagline: "Gestão enterprise de riscos psicossociais, do diagnóstico à evidência auditável.",
  shortTagline: "NR-1 enterprise, do diagnóstico à evidência.",
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
  { label: "Contato", href: "/contato" },
] as const;
