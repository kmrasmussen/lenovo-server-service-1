import type { Metadata } from "next";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/app/ui/app-sidebar';

export const metadata: Metadata = {
  title: "dumper app title",
  description: "dump your thoughts here",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
            {children}
      </body>
    </html>
  );
}
