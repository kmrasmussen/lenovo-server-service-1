import Dumper from '@/app/ui/Dumper';
import AuthBox from '@/app/ui/AuthBox';
import InstallPrompt from '@/app/ui/InstallPrompt';
import RecordVoiceMessage from '@/app/ui/RecordVoiceMessage';
import Camera from '@/app/ui/Camera';
import { auth } from '@/auth';
import { Separator } from '@/components/ui/separator';
import { redirect } from 'next/navigation';

export default async function Home() {
  redirect('/dashboard');
}
