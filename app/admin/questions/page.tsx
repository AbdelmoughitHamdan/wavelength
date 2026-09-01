import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isAdminAuthorizationHeaderValid } from "../../../lib/admin-auth";
import AdminQuestionsClient from "../../../components/AdminQuestionsClient";

export const dynamic = "force-dynamic";

export default function AdminQuestionsPage() {
  if (!isAdminAuthorizationHeaderValid(headers().get("authorization"))) notFound();
  return <AdminQuestionsClient />;
}
