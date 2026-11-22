import { redirect } from "next/navigation";
import { getShowcaseCmsUrl } from "../showcase-data";
// Payload performs its own login and authorization. All editing happens there.
export default function NewShowcasePage() {
  redirect(getShowcaseCmsUrl());
}
