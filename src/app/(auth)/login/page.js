import AuthForm from "@/components/forms/AuthForm";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <AuthForm mode="login" />
    </main>
  );
}
