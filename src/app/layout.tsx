import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pronósticos TC2",
  description: "Pronósticos de boxeo del club",
};

async function UserNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? (
    <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
      <span className="text-zinc-500">{user.email}</span>
      <button className="underline">Salir</button>
    </form>
  ) : (
    <Link href="/login" className="text-sm underline">
      Entrar
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="flex items-center justify-between border-b border-zinc-300 px-4 py-3">
          <Link href="/" className="font-semibold">
            🥊 Pronósticos TC2
          </Link>
          <Suspense fallback={null}>
            <UserNav />
          </Suspense>
        </header>
        {children}
        <footer className="border-t border-zinc-300 px-4 py-3 text-xs text-zinc-500">
          Contains data from{" "}
          <a href="https://boxerbook.com" className="underline">
            Boxerbook
          </a>{" "}
          (https://boxerbook.com), © QuadroM LLC, licensed under{" "}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/" className="underline">
            ODbL
          </a>
        </footer>
      </body>
    </html>
  );
}
