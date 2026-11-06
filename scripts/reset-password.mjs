// Owner tool: set a new password for someone who forgot theirs (there is no email service to send reset links).
//   node scripts/reset-password.mjs someone@example.com
// You are asked for the new password so it never appears in your shell history.
import { createInterface } from "node:readline";
import { initAuth, resetPassword } from "../server/auth.mjs";

const email = process.argv[2];
if (!email) { console.error("Usage: node scripts/reset-password.mjs <email>"); process.exit(1); }

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));
const pw = await ask(`New password for ${email} (it will be visible while you type): `);
rl.close();

await initAuth();
const r = await resetPassword(email, pw);
if (!r.ok) { console.error("Not changed:", r.error); process.exit(1); }
console.log("Done. They have been signed out everywhere and can sign in with the new password.");
