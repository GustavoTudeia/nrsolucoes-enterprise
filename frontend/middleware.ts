import { NextRequest, NextResponse } from "next/server";

function isConsolePath(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/org") ||
    pathname.startsWith("/colaboradores") ||
    pathname.startsWith("/questionarios") ||
    pathname.startsWith("/campanhas") ||
    pathname.startsWith("/resultados") ||
    pathname.startsWith("/risco") ||
    pathname.startsWith("/plano-acao") ||
    pathname.startsWith("/lms") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/platform") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/auditoria") ||
    pathname.startsWith("/relatorios")
  );
}

function isEmployeeProtectedPath(pathname: string) {
  return pathname === "/employee/dashboard" || pathname.startsWith("/employee/conteudos");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const consoleToken = req.cookies.get("console_token")?.value;
  const employeeToken = req.cookies.get("employee_token")?.value;

  if (isConsolePath(pathname) && !consoleToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isEmployeeProtectedPath(pathname) && !employeeToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/"; // send to home; employee entry needs tenant slug
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/org/:path*",
    "/colaboradores/:path*",
    "/questionarios/:path*",
    "/campanhas/:path*",
    "/resultados/:path*",
    "/risco/:path*",
    "/plano-acao/:path*",
    "/lms/:path*",
    "/billing/:path*",
    "/platform/:path*",
    "/settings/:path*",
    "/auditoria/:path*",
    "/relatorios/:path*",
    "/employee/dashboard",
    "/employee/conteudos/:path*",
  ],
};
