import type { Metadata } from "next";
import AuthBox from '@/app/ui/AuthBox';
import { auth } from '@/auth';
import Link from 'next/link';
import { MessageCircle, User, Camera, Images, Radio } from 'lucide-react';

export const metadata: Metadata = {
  title: "intercebd",
  description: "ready when you are",
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
    ready when you are
    <AuthBox />
    </div>
    );
  }
  
  return (<div className="flex h-screen flex-col">
    <div className="w-full border-r p-2 flex flex-row justify-between items-center">
      <div className="flex">
      <nav className="flex space-x-4">
        <Link key="chat-link" href="/dashboard" className="p-2 hover:bg-gray-100 rounded">
          <MessageCircle className="h-5 w-5" />
        </Link>
        <Link key="realtime-link" href="/dashboard/realtime" className="p-2 hover:bg-gray-100 rounded">
          <Radio className="h-5 w-5" />
        </Link>
        <Link key="account-link" href="/dashboard/account" className="p-2 hover:bg-gray-100 rounded">
          <User className="h-5 w-5" />
        </Link>
        <Link key="camera-link" href="/dashboard/camera" className="p-2 hover:bg-gray-100 rounded">
          <Camera className="h-5 w-5" />
        </Link>
        <Link key="pictures-link" href="/dashboard/pictures" className="p-2 hover:bg-gray-100 rounded">
          <Images className="h-5 w-5" />
        </Link>
      </nav> 
      </div>
    </div>
    <div className="flex-1">{children}
    </div>
  </div>);

}
