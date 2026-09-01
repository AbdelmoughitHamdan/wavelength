import AuthForm from "../../components/AuthForm";
import { safeNextPath } from "../../lib/auth";

type PageProps = { searchParams: { next?: string | string[]; message?: string | string[] } };

export default function LoginPage({ searchParams }: PageProps) {
  const next = safeNextPath(typeof searchParams.next === "string" ? searchParams.next : undefined);
  const message = typeof searchParams.message === "string" ? searchParams.message.slice(0, 200) : undefined;
  return <AuthForm mode="login" nextPath={next} message={message} />;
}
