// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Growth Engine",
  description: "Your all in one agentic growth platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-black text-white antialiased">
        <NavBar />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
