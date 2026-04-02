import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carballo Bike — Panel de Gestion",
  description: "Panel de gestion de retiros y service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className="m-0 min-h-screen antialiased">{children}</body>
    </html>
  );
}
