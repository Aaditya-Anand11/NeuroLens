import type { Metadata } from "next";
import "./globals.css";
import NavBar from "../components/NavBar";

export const metadata: Metadata = {
  title: "NeuroLens — Cognitive Fatigue Detection",
  description:
    "Real-time multimodal cognitive fatigue and mental overload detection system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen antialiased">
        <NavBar />
        <main className="max-w-[1400px] mx-auto px-5 sm:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
