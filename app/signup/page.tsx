import AuthForm from "../../components/AuthForm";
import { safeNextPath } from "../../lib/auth";

type PageProps = { searchParams: { next?: string | string[] } };

export default function SignupPage({ searchParams }: PageProps) {
  const next = safeNextPath(typeof searchParams.next === "string" ? searchParams.next : undefined);
  return <AuthForm mode="signup" nextPath={next} />;
}
