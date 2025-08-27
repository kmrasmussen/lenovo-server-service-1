import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { googleSignIn, googleSignOut } from '@/app/actions/auth';

const AuthBox = async () => {
  const session = await auth();
  if (!session) {
    return (<div><form action={googleSignIn}><Button type="submit">sign in with google</Button></form></div>);
  }

  return (<div><form action={googleSignOut}><Button type="submit">sign out</Button></form></div>);
}

export default AuthBox;
