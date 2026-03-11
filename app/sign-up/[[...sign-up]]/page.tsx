import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-white px-4 py-8 flex items-start justify-center">
      <SignUp />
    </div>
  );
}
