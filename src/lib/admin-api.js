import { auth } from "./firebase.js";

export async function adminApi(path, options = {}) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { Authorization: "Bearer " + token, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Admin request failed.");
  return body;
}
