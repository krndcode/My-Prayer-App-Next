import AuthForm from "@/components/forms/AuthForm";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <AuthForm mode="reset" />
    </main>
  );
}
