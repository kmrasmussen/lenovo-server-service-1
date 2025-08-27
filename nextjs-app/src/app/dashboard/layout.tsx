import type { Metadata } from "next";
import AuthBox from '@/app/ui/AuthBox';
import { auth } from '@/auth';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';

export const metadata: Metadata = {
  title: "dumper app title",
  description: "dump your thoughts here",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  const session = await auth();
  if (!session?.user?.id) {
    return (
    <div className="flex flex-col items-center justify-center min-h-screen">
    you are not logged in
    <AuthBox />
    </div>
    );
  }
  
  return (<div className="flex h-screen flex-col">
    <div className="w-full border-r p-2 flex flex-row justify-between items-center">
      <div className="flex">
      <LayoutDashboard className="h-8 w-8 mr-6 text-blue-600" />
      <nav className="flex space-x-2">
        <Link key="overview-link" href="/dashboard">dashboard</Link>
        <Link key="account-link" href="/dashboard/account">account</Link>
        <Link key="camera-link" href="/dashboard/camera">camera</Link>
        <Link key="pictures-link" href="/dashboard/pictures">pictures</Link>
      </nav> 
      </div>
    </div>
    <div className="flex-1">{children}
    </div>
  </div>);

}
