import { redirect } from "next/navigation";

const SuperAdminRedirect = () => {
  redirect("/dashboard/administrator");
};

export default SuperAdminRedirect;
