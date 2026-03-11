import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-white px-4 py-8 flex items-start justify-center">
      <SignIn />
    </div>
  );
}
