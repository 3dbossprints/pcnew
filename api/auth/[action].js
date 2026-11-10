import { sendJson } from "../_lib/http.js";
import requestEmailCode from "../_lib/email-code.js";
import verifyEmailCode from "../_lib/verify-email-code.js";
import requestPasswordReset from "../_lib/password-reset.js";
import confirmPasswordReset from "../_lib/password-reset-confirm.js";

const actions = {
  "email-code": requestEmailCode,
  "verify-email-code": verifyEmailCode,
  "password-reset": requestPasswordReset,
  "password-reset-confirm": confirmPasswordReset,
};

export default async function handler(req, res) {
  const action = req.query?.action;
  const run = actions[action];
  if (!run) return sendJson(res, 404, { error: "Authentication action not found." });
  return run(req, res);
}
